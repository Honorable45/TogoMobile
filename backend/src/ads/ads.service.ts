import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import type { HeroAd } from '@prisma/client';
import { tags, RevalidationService } from '../cache/revalidation.service';
import { AuditService } from '../common/audit.service';
import { randomToken } from '../common/crypto';
import { JobsService } from '../jobs/jobs.service';
import { processHeroImage } from '../media/media-processing';
import { PrismaService } from '../prisma/prisma.service';
import { ProductPresenter } from '../products/product-presenter';
import { StorageService } from '../storage/storage.service';

export interface HeroAdInput {
  title?: string;
  subtitle?: string | null;
  advertiser?: string | null;
  linkUrl?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  isActive?: boolean;
  sortOrder?: number;
}

export type HeroAdStatus = 'ACTIVE' | 'SCHEDULED' | 'ENDED' | 'DISABLED';

/** Nombre maximal de publicités qui se succèdent en fond de l'accueil. */
const MAX_PUBLIC = 6;

/** Publicités affichées en fond de la section d'accueil, gérées par l'administration. */
@Injectable()
export class AdsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly presenter: ProductPresenter,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit() {
    // Début et fin programmés : aucune écriture à ce moment-là, d'où une vérification périodique du cache.
    this.jobs.registerPeriodic({ name: 'ads.boundaries', everyMs: 60_000, run: () => this.boundaries() });
  }

  static status(ad: Pick<HeroAd, 'isActive' | 'startsAt' | 'endsAt'>, now = new Date()): HeroAdStatus {
    if (!ad.isActive) return 'DISABLED';
    if (ad.endsAt && ad.endsAt <= now) return 'ENDED';
    if (ad.startsAt && ad.startsAt > now) return 'SCHEDULED';
    return 'ACTIVE';
  }

  private view(ad: HeroAd) {
    return {
      id: ad.id,
      title: ad.title,
      subtitle: ad.subtitle,
      advertiser: ad.advertiser,
      linkUrl: ad.linkUrl,
      imageUrl: this.presenter.url(ad.imageKey),
      mobileImageUrl: this.presenter.url(ad.mobileImageKey),
      width: ad.width,
      height: ad.height,
    };
  }

  /** Publicités en cours, dans l'ordre d'affichage (accueil). */
  async publicList(now = new Date()) {
    const rows = await this.prisma.heroAd.findMany({
      where: {
        isActive: true,
        AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      take: MAX_PUBLIC,
    });
    return rows.map((r) => this.view(r));
  }

  async adminList() {
    const rows = await this.prisma.heroAd.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }], take: 100 });
    const now = new Date();
    return rows.map((r) => ({ ...this.view(r), startsAt: r.startsAt, endsAt: r.endsAt, isActive: r.isActive, sortOrder: r.sortOrder, status: AdsService.status(r, now), createdAt: r.createdAt }));
  }

  private checkDates(startsAt: Date | null | undefined, endsAt: Date | null | undefined) {
    if (startsAt && endsAt && endsAt <= startsAt) throw new BadRequestException('La date de fin doit être postérieure à la date de début.');
  }

  private async storeImage(file: Buffer) {
    const img = await processHeroImage(file);
    const base = `ads/${randomToken(12).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const keys = { imageKey: `${base}.webp`, mobileImageKey: `${base}-m.webp` };
    await Promise.all([this.storage.put(keys.imageKey, img.desktop, 'image/webp'), this.storage.put(keys.mobileImageKey, img.mobile, 'image/webp')]);
    return { ...keys, width: img.width, height: img.height };
  }

  private async get(id: string) {
    const ad = await this.prisma.heroAd.findUnique({ where: { id } });
    if (!ad) throw new NotFoundException('Publicité introuvable.');
    return ad;
  }

  private async refreshHome() {
    await this.revalidation.invalidate([tags.home]);
  }

  async create(adminId: string, input: HeroAdInput, file: Buffer) {
    if (!input.title) throw new BadRequestException('Le titre est obligatoire.');
    this.checkDates(input.startsAt, input.endsAt);
    const image = await this.storeImage(file);
    const ad = await this.prisma.heroAd.create({
      data: {
        title: input.title,
        subtitle: input.subtitle ?? null,
        advertiser: input.advertiser ?? null,
        linkUrl: input.linkUrl ?? null,
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
        createdById: adminId,
        ...image,
      },
    });
    await this.audit.log(adminId, 'ad.create', 'HeroAd', ad.id, { title: ad.title, advertiser: ad.advertiser });
    await this.refreshHome();
    return ad;
  }

  async update(adminId: string, id: string, input: HeroAdInput) {
    const ad = await this.get(id);
    this.checkDates(input.startsAt === undefined ? ad.startsAt : input.startsAt, input.endsAt === undefined ? ad.endsAt : input.endsAt);
    const updated = await this.prisma.heroAd.update({ where: { id }, data: { ...input } });
    await this.audit.log(adminId, 'ad.update', 'HeroAd', id, { fields: Object.keys(input) });
    await this.refreshHome();
    return updated;
  }

  async replaceImage(adminId: string, id: string, file: Buffer) {
    const ad = await this.get(id);
    const image = await this.storeImage(file);
    const [updated] = await this.prisma.$transaction([
      this.prisma.heroAd.update({ where: { id }, data: image }),
      this.prisma.storageGarbage.createMany({ data: [{ key: ad.imageKey }, { key: ad.mobileImageKey }] }),
    ]);
    await this.audit.log(adminId, 'ad.image', 'HeroAd', id);
    await this.refreshHome();
    return updated;
  }

  async remove(adminId: string, id: string) {
    const ad = await this.get(id);
    await this.prisma.$transaction([
      this.prisma.heroAd.delete({ where: { id } }),
      // Fichiers supprimés du stockage par le nettoyage périodique.
      this.prisma.storageGarbage.createMany({ data: [{ key: ad.imageKey }, { key: ad.mobileImageKey }] }),
    ]);
    await this.audit.log(adminId, 'ad.delete', 'HeroAd', id, { title: ad.title });
    await this.refreshHome();
    return { ok: true };
  }

  async boundaries() {
    if (!this.revalidation.enabled) return;
    const now = Date.now();
    const window = { gte: new Date(now - 120_000), lte: new Date(now) };
    const count = await this.prisma.heroAd.count({ where: { isActive: true, OR: [{ startsAt: window }, { endsAt: window }] } });
    if (count) await this.refreshHome();
  }
}
