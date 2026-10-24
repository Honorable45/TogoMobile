import { Injectable, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import { AdsModule } from './ads/ads.module';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { AuditModule } from './common/audit.service';
import { CacheModule } from './cache/revalidation.service';
import { JobsModule } from './jobs/jobs.service';
import { ObservabilityModule } from './observability/observability.module';
import { AuthGuard, OriginGuard } from './common/guards';
import { RedisThrottlerStorage } from './common/redis-throttler.storage';
import { env } from './config/env';
import { FavoritesModule } from './favorites/favorites.module';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.service';
import { PresenterModule } from './products/product-presenter';
import { ProductsModule } from './products/products.module';
import { PromotionsModule } from './promotions/promotions.module';
import { ReferentialsModule } from './referentials/referentials.module';
import { ReportsModule } from './reports/reports.module';
import { SalesModule } from './sales/sales.module';
import { ShopsModule } from './shops/shops.module';
import { StatsModule } from './stats/stats.module';
import { StorageModule } from './storage/storage.service';

/** Limitation de fréquence par adresse IP (derrière le proxy de l'hébergeur, voir TRUST_PROXY_HOPS). */
@Injectable()
class IpThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    // En test uniquement : un en-tête permet d'isoler les scénarios qui partagent la même IP.
    const testKey = env().isTest ? (req.headers['x-test-client'] as string | undefined) : undefined;
    return `${req.ip}${testKey ? ':' + testKey : ''}`;
  }
}

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: env().security.rateLimitPerMinute }],
      // Avec plusieurs instances, les compteurs doivent être partagés : Redis si REDIS_URL est défini.
      storage: env().security.redisUrl ? new RedisThrottlerStorage(env().security.redisUrl) : undefined,
    }),
    PrismaModule,
    ObservabilityModule,
    JobsModule,
    CacheModule,
    AuditModule,
    StorageModule,
    PresenterModule,
    AuthModule,
    ShopsModule,
    ProductsModule,
    CatalogModule,
    PromotionsModule,
    FavoritesModule,
    SalesModule,
    ReportsModule,
    ReferentialsModule,
    StatsModule,
    AdminModule,
    AdsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: IpThrottlerGuard },
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
