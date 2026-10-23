import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paged, skipTake } from '../common/pagination';
import { escapeLike, normalizeSearch } from '../common/text';
import { RUNNING_PROMOTIONS_CTE, RUNNING_PROMOTIONS_JOIN } from '../common/visibility';
import { PrismaService } from '../prisma/prisma.service';
import { CARD_INCLUDE, ProductPresenter } from '../products/product-presenter';
import { CatalogQuery } from './catalog.dto';

/** Lissage bayésien des notes : un produit avec un seul avis 5/5 ne passe pas devant 40 avis à 4,7. */
/**
 * Cache mémoire des décomptes : le nombre total de résultats (« 85 714 téléphones ») n'a pas besoin
 * d'être exact à la seconde, alors que son calcul parcourt toutes les annonces correspondantes.
 * Les annonces elles-mêmes, leurs prix et promotions ne sont jamais servis depuis ce cache.
 */
const COUNT_TTL_MS = 30_000;
const COUNT_CACHE_MAX = 500;
const countCache = new Map<string, { n: number; at: number }>();

const RATING_PRIOR_MEAN = 3.5;
const RATING_PRIOR_WEIGHT = 3;

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presenter: ProductPresenter,
  ) {}

  async search(q: CatalogQuery) {
    const { skip } = skipTake(q);
    const where: Prisma.Sql[] = [
      Prisma.sql`p.status = 'PUBLISHED'`,
      Prisma.sql`p.moderation = 'APPROVED'`,
      Prisma.sql`p."removedAt" IS NULL`,
      Prisma.sql`s.status = 'ACTIVE'`,
      Prisma.sql`p.availability <> 'WITHDRAWN'`,
    ];

    // Recherche textuelle : les correspondances sont calculées d'abord via l'index trigramme (CTE matérialisée),
    // puis triées. Sans cela, PostgreSQL sous-estime les termes rares et parcourt tout l'index de tri
    // (mesuré : 74 ms pour « tp-0042 » sur 100 000 annonces, contre quelques millisecondes ainsi).
    let textCte: Prisma.Sql | null = null;
    if (q.q) {
      const normalized = normalizeSearch(q.q);
      const tokens = normalized.split(' ').filter(Boolean).slice(0, 8);
      if (tokens.length) {
        const allTokens = Prisma.join(
          tokens.map((t) => Prisma.sql`"searchText" ILIKE ${'%' + escapeLike(t) + '%'}`),
          ' AND ',
        );
        const compact = normalized.replace(/ /g, '');
        textCte = Prisma.sql`text_matches AS MATERIALIZED (
          SELECT id FROM "Product" WHERE (${allTokens}) OR "searchText" ILIKE ${'%' + escapeLike(compact) + '%'}
        )`;
      }
    }
    if (q.brand?.length) where.push(Prisma.sql`b.slug IN (${Prisma.join(q.brand)})`);
    if (q.category) {
      where.push(Prisma.sql`p."categoryId" IN (
        SELECT c.id FROM "Category" c WHERE c.slug = ${q.category}
        OR c."parentId" IN (SELECT c2.id FROM "Category" c2 WHERE c2.slug = ${q.category}))`);
    }
    if (q.shop) where.push(Prisma.sql`s.slug = ${q.shop}`);
    if (q.condition?.length) {
      where.push(Prisma.sql`p.condition::text IN (${Prisma.join(q.condition)})`);
    }
    if (q.storage?.length) where.push(Prisma.sql`p."storageGb" IN (${Prisma.join(q.storage)})`);
    if (q.ram?.length) where.push(Prisma.sql`p."ramGb" IN (${Prisma.join(q.ram)})`);
    if (q.available) where.push(Prisma.sql`p.availability = 'AVAILABLE'`);
    if (q.promo) where.push(Prisma.sql`pr."promoPrice" IS NOT NULL`);
    if (q.minPrice !== undefined) where.push(Prisma.sql`COALESCE(pr."promoPrice", p.price) >= ${q.minPrice}`);
    if (q.maxPrice !== undefined) where.push(Prisma.sql`COALESCE(pr."promoPrice", p.price) <= ${q.maxPrice}`);
    if (q.minRating !== undefined) {
      where.push(Prisma.sql`p."ratingCount" > 0 AND p."ratingAvg" >= ${q.minRating}`);
    }

    const orderBy = {
      recent: Prisma.sql`p."publishedAt" DESC NULLS LAST`,
      price_asc: Prisma.sql`COALESCE(pr."promoPrice", p.price) ASC`,
      price_desc: Prisma.sql`COALESCE(pr."promoPrice", p.price) DESC`,
      discount: Prisma.sql`(CASE WHEN pr."promoPrice" IS NULL THEN 0
        ELSE (pr."referencePrice" - pr."promoPrice")::float / pr."referencePrice" END) DESC, p."publishedAt" DESC`,
      rating: Prisma.sql`((p."ratingAvg" * p."ratingCount" + ${RATING_PRIOR_MEAN * RATING_PRIOR_WEIGHT})
        / (p."ratingCount" + ${RATING_PRIOR_WEIGHT})) DESC, p."ratingCount" DESC`,
      popular: Prisma.sql`(p."viewCount" + 5 * p."whatsappClicks") DESC, p."publishedAt" DESC`,
    }[q.sort];

    // La jointure des promotions n'est faite que si un filtre ou un tri porte sur le prix courant.
    const needsPromo = q.promo || q.minPrice !== undefined || q.maxPrice !== undefined || ['price_asc', 'price_desc', 'discount'].includes(q.sort);
    const ctes = [needsPromo ? RUNNING_PROMOTIONS_CTE : null, textCte].filter((c): c is Prisma.Sql => !!c);
    const withPromo = ctes.length ? Prisma.sql`WITH ${Prisma.join(ctes, ', ')}` : Prisma.empty;
    const from = Prisma.sql`
      FROM "Product" p
      ${textCte ? Prisma.sql`JOIN text_matches tm ON tm.id = p.id` : Prisma.empty}
      JOIN "Shop" s ON s.id = p."shopId"
      ${q.brand?.length ? Prisma.sql`JOIN "Brand" b ON b.id = p."brandId"` : Prisma.empty}
      ${needsPromo ? RUNNING_PROMOTIONS_JOIN : Prisma.empty}
      WHERE ${Prisma.join(where, ' AND ')}`;

    // Les annonces disponibles passent toujours avant les annonces indisponibles.
    // Le tri par défaut s'appuie sur l'index partiel "Product_listing_recent_idx".
    const countKey = JSON.stringify({ ...q, page: undefined, pageSize: undefined, sort: undefined });
    const cached = countCache.get(countKey);
    const [rows, total] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: string }>>`
        ${withPromo}
        SELECT p.id ${from}
        ORDER BY (p.availability = 'AVAILABLE') DESC, ${orderBy}, p.id
        LIMIT ${q.pageSize} OFFSET ${skip}`,
      cached && Date.now() - cached.at < COUNT_TTL_MS
        ? Promise.resolve(cached.n)
        : this.prisma.$queryRaw<Array<{ n: bigint }>>`${withPromo} SELECT COUNT(*) AS n ${from}`.then((r) => {
            const n = Number(r[0].n);
            if (countCache.size >= COUNT_CACHE_MAX) countCache.delete(countCache.keys().next().value!);
            countCache.set(countKey, { n, at: Date.now() });
            return n;
          }),
    ]);
    const ids = rows.map((r) => r.id);
    const products = await this.prisma.product.findMany({ where: { id: { in: ids } }, include: CARD_INCLUDE });
    const byId = new Map(products.map((p) => [p.id, p]));
    const ordered = ids.map((id) => byId.get(id)!).filter(Boolean);
    return paged(await this.presenter.cards(ordered), total, q.page, q.pageSize);
  }

}
