import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Santé')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Vivacité : le processus répond (aucune dépendance vérifiée). */
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  /**
   * Disponibilité : base de données joignable. Indique aussi l'état de la file de tâches
   * (nombres seulement, aucune donnée sensible). Utilisé par l'hébergeur pour router le trafic.
   */
  @Get()
  async ready() {
    const started = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: 'error', database: 'unreachable' });
    }
    const dbMs = Date.now() - started;
    const [pending, failed] = await Promise.all([
      this.prisma.job.count({ where: { status: 'PENDING', runAt: { lt: new Date(Date.now() - 5 * 60_000) } } }),
      this.prisma.job.count({ where: { status: 'FAILED', updatedAt: { gt: new Date(Date.now() - 3_600_000) } } }),
    ]);
    return {
      status: 'ok',
      database: 'ok',
      databaseLatencyMs: dbMs,
      jobs: { delayedOver5min: pending, failedLastHour: failed },
      time: new Date().toISOString(),
    };
  }
}
