import { Global, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import { slowQueries } from '../observability/metrics';

/**
 * Client Prisma unique par processus.
 * Taille du pool : paramètre `connection_limit` de DATABASE_URL (voir docs/DEPLOIEMENT.md).
 * Requêtes lentes : journalisées au-delà de SLOW_QUERY_MS (sans les valeurs des paramètres).
 */
@Injectable()
export class PrismaService extends PrismaClient<Prisma.PrismaClientOptions, 'query'> implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Prisma');

  constructor() {
    const slowMs = env().observability.slowQueryMs;
    super(slowMs > 0 ? { log: [{ emit: 'event', level: 'query' }, 'warn', 'error'] } : { log: ['warn', 'error'] });
    if (slowMs > 0) {
      this.$on('query', (e) => {
        if (e.duration < slowMs) return;
        slowQueries.inc();
        this.logger.warn(JSON.stringify({ event: 'slow_query', ms: e.duration, query: e.query.slice(0, 500) }));
      });
    }
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
