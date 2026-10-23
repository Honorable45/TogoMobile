import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Shop } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { paged, skipTake } from '../common/pagination';
import { normalizePhone } from '../common/phone';
import { slugify } from '../common/text';
import { listedProductWhere } from '../common/visibility';
import { processImage } from '../media/media-processing';
import { PrismaService } from '../prisma/prisma.service';
import { ProductPresenter } from '../products/product-presenter';
import { StorageService } from '../storage/storage.service';
import { randomToken } from '../common/crypto';
import { RevalidationService } from '../cache/revalidation.service';
import { CreateShopDto, normalizeSocialUrl, SocialLinksDto, UpdateShopDto } from './shop.dto';

/** Champs dont la modification, une fois la boutique validée, doit être approuvée par l'administration. */
const SENSITIVE_FIELDS = ['name', 'whatsapp'] as const;

export function cleanSocialLinks(input: SocialLinksDto | undefined, current: Record<string, string> = {}) {
  if (!input) return current;
  const out: Record<string, string> = { ...current };
  for (const [network, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (value === null) delete out[network];
    else {
      const url = normalizeSocialUrl(network, value);
      if (!url) throw new BadRequestException(`Lien ${network} invalide.`);
      out[network] = url;
    }
  }
  return out;
}

@Injectable()
export class ShopsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presenter: ProductPresenter,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
  ) {}

  // ─── Règles d'accès vendeur ───────────────────────────────────────────────

  async ownedShop(userId: string): Promise<Shop> {
    const shop = await this.prisma.shop.findUnique({ where: { ownerId: userId } });
    if (!shop) throw new NotFoundException("Vous n'avez pas encore de boutique.");
    return shop;
  }

  /** Une boutique suspendue ne peut plus rien modifier ; seules les boutiques actives publient. */
  assertWritable(shop: Shop) {
    if (shop.status === 'SUSPENDED') {
      throw new ForbiddenException('Votre boutique est suspendue : aucune modification n’est possible. Contactez l’administration.');
    }
  }

  assertActive(shop: Shop, action = 'effectuer cette action') {
    this.assertWritable(shop);
    if (shop.status !== 'ACTIVE') {
      const why =
        shop.status === 'PENDING'
          ? 'votre boutique est en attente de validation'
          : shop.status === 'CHANGES_REQUESTED'
            ? 'des corrections ont été demandées sur votre boutique'
            : shop.status === 'CLOSED'
            ? 'votre boutique est fermée temporairement'
            : 'votre boutique n’est pas active';
      throw new ForbiddenException(`Impossible de ${action} : ${why}.`);
    }
  }

  private async uniqueSlug(name: string) {
    const base = slugify(name) || 'boutique';
    for (let i = 0; i < 5; i++) {
      const candidate = i === 0 ? base : `${base}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 4)}`;
      const taken = await this.prisma.shop.count({ where: { slug: candidate } });
      if (!taken) return candidate;
    }
    throw new ConflictException('Impossible de générer une adresse unique pour cette boutique.');
  }

  // ─── Espace vendeur ───────────────────────────────────────────────────────

  async apply(userId: string, dto: CreateShopDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { shop: true } });
    if (user.shop) throw new ConflictException('Vous avez déjà une boutique.');
    if (user.role === 'ADMIN') throw new ForbiddenException('Un compte administrateur ne peut pas ouvrir de boutique.');

    const shop = await this.prisma.$transaction(async (tx) => {
      const created = await tx.shop.create({
        data: {
          ownerId: userId,
          name: dto.name,
          slug: await this.uniqueSlug(dto.name),
          description: dto.description,
          city: dto.city,
          district: dto.district,
          address: dto.address,
          whatsapp: normalizePhone(dto.whatsapp)!,
          phone: normalizePhone(dto.phone),
          openingHours: dto.openingHours,
          socialLinks: cleanSocialLinks(dto.socialLinks),
          status: 'PENDING',
        },
      });
      // Le rôle vendeur est attribué par le serveur au dépôt de la demande ; la boutique reste
      // invisible tant que l'administration ne l'a pas validée.
      await tx.user.update({ where: { id: userId }, data: { role: 'SELLER' } });
      await this.audit.log(userId, 'shop.apply', 'Shop', created.id, {}, tx);
      return created;
    });
    return this.sellerView(shop);
  }

  async getMine(userId: string) {
    return this.sellerView(await this.ownedShop(userId));
  }

  async update(userId: string, dto: UpdateShopDto) {
    const shop = await this.ownedShop(userId);
    this.assertWritable(shop);

    const data: Prisma.ShopUpdateInput = {
      description: dto.description,
      city: dto.city,
      district: dto.district,
      address: dto.address,
      openingHours: dto.openingHours,
      phone: dto.phone === null ? null : dto.phone ? normalizePhone(dto.phone) : undefined,
    };
    if (dto.socialLinks) data.socialLinks = cleanSocialLinks(dto.socialLinks, shop.socialLinks as Record<string, string>);

    const sensitive: Record<string, string> = {};
    if (dto.name && dto.name !== shop.name) sensitive.name = dto.name;
    const wa = dto.whatsapp ? normalizePhone(dto.whatsapp)! : undefined;
    if (wa && wa !== shop.whatsapp) sensitive.whatsapp = wa;

    const draftLike = shop.status === 'PENDING' || shop.status === 'REJECTED' || shop.status === 'CHANGES_REQUESTED';
    const needsReview = !draftLike;
    if (Object.keys(sensitive).length) {
      if (needsReview) {
        data.pendingChanges = { ...((shop.pendingChanges as object) ?? {}), ...sensitive, requestedAt: new Date().toISOString() };
      } else {
        Object.assign(data, sensitive);
      }
    }
    // Une demande refusée ou à corriger est soumise à nouveau dès qu'elle est modifiée.
    if (shop.status === 'REJECTED' || shop.status === 'CHANGES_REQUESTED') data.status = 'PENDING';

    const updated = await this.prisma.shop.update({ where: { id: shop.id }, data });
    await this.audit.log(userId, 'shop.update', 'Shop', shop.id, {
      fields: Object.keys(dto),
      pendingReview: needsReview ? Object.keys(sensitive) : [],
    });
    await this.revalidation.shop(shop.id);
    return this.sellerView(updated);
  }

  async setLogo(userId: string, file: Buffer) {
    const shop = await this.ownedShop(userId);
    this.assertWritable(shop);
    const img = await processImage(file, 400, 160);
    const key = `shops/${shop.id}/logo-${randomToken(8).toLowerCase().replace(/[^a-z0-9]/g, '')}.webp`;
    await this.storage.put(key, img.main, 'image/webp');
    const [updated] = await this.prisma.$transaction([
      this.prisma.shop.update({ where: { id: shop.id }, data: { logoKey: key } }),
      ...(shop.logoKey ? [this.prisma.storageGarbage.create({ data: { key: shop.logoKey } })] : []),
    ]);
    await this.revalidation.shop(shop.id);
    return this.sellerView(updated);
  }

  async setOpen(userId: string, open: boolean) {
    const shop = await this.ownedShop(userId);
    this.assertWritable(shop);
    if (open && shop.status !== 'CLOSED') throw new BadRequestException('La boutique n’est pas fermée.');
    if (!open && shop.status !== 'ACTIVE') throw new BadRequestException('Seule une boutique active peut être fermée temporairement.');
    const updated = await this.prisma.shop.update({ where: { id: shop.id }, data: { status: open ? 'ACTIVE' : 'CLOSED' } });
    await this.audit.log(userId, open ? 'shop.reopen' : 'shop.close', 'Shop', shop.id);
    await this.revalidation.shop(shop.id);
    return this.sellerView(updated);
  }

  sellerView(shop: Shop) {
    return {
      ...shop,
      logoUrl: this.presenter.url(shop.logoKey),
      publicUrlAvailable: shop.status === 'ACTIVE' || shop.status === 'CLOSED',
    };
  }

  // ─── Public ───────────────────────────────────────────────────────────────

  async list(q: { page: number; pageSize: number; q?: string; city?: string; sort?: string }) {
    const where: Prisma.ShopWhereInput = {
      status: 'ACTIVE',
      ...(q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}),
      ...(q.city ? { city: { equals: q.city, mode: 'insensitive' } } : {}),
    };
    const orderBy: Prisma.ShopOrderByWithRelationInput[] =
      q.sort === 'rating' ? [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }] : q.sort === 'name' ? [{ name: 'asc' }] : [{ validatedAt: 'desc' }];
    const [items, total] = await Promise.all([
      this.prisma.shop.findMany({
        where,
        orderBy,
        ...skipTake(q),
        include: { _count: { select: { products: { where: { ...listedProductWhere(), availability: 'AVAILABLE' } } } } },
      }),
      this.prisma.shop.count({ where }),
    ]);
    return paged(items.map((s) => this.publicCard(s, s._count.products)), total, q.page, q.pageSize);
  }

  publicCard(s: Shop, productCount: number) {
    return {
      id: s.id,
      name: s.name,
      slug: s.slug,
      logoUrl: this.presenter.url(s.logoKey),
      city: s.city,
      district: s.district,
      description: s.description,
      ratingAvg: s.ratingAvg,
      ratingCount: s.ratingCount,
      identityVerified: !!s.identityVerifiedAt,
      productCount,
    };
  }

  async publicShop(slug: string) {
    const s = await this.prisma.shop.findFirst({ where: { slug, status: { in: ['ACTIVE', 'CLOSED'] } } });
    if (!s) throw new NotFoundException("Cette boutique n'existe pas ou n'est pas disponible.");
    const productCount =
      s.status === 'ACTIVE' ? await this.prisma.product.count({ where: { shopId: s.id, ...listedProductWhere(), availability: 'AVAILABLE' } }) : 0;
    // Données publiques uniquement : ni propriétaire, ni modifications en attente, ni motifs internes.
    return {
      ...this.publicCard(s, productCount),
      address: s.address,
      phone: s.phone,
      whatsapp: s.whatsapp,
      socialLinks: s.socialLinks as Record<string, string>,
      openingHours: s.openingHours,
      status: s.status,
      validatedAt: s.validatedAt,
      isDemo: s.isDemo,
      createdAt: s.createdAt,
    };
  }
}
