import {
  Body,
  CallHandler,
  Controller,
  ExecutionContext,
  Get,
  Global,
  Header,
  Headers,
  HttpCode,
  Injectable,
  Logger,
  MiddlewareConsumer,
  Module,
  NestInterceptor,
  NestMiddleware,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { Observable } from 'rxjs';
import { AuthedRequest, IS_PUBLIC, Public } from '../common/auth.decorators';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { clientErrors, httpDuration, registry } from './metrics';

/** Mesure chaque requête ; ne journalise que les requêtes lentes et les erreurs serveur (pas de données personnelles). */
@Injectable()
export class RequestMetricsMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : 'non-route';
      httpDuration.observe({ method: req.method, route, status: String(res.statusCode) }, seconds);
      const ms = Math.round(seconds * 1000);
      if (res.statusCode >= 500 || ms >= env().observability.slowRequestMs) {
        this.logger.warn(JSON.stringify({ event: res.statusCode >= 500 ? 'http_error' : 'http_slow', method: req.method, route, status: res.statusCode, ms }));
      }
    });
    next();
  }
}

/**
 * Politique de cache HTTP :
 * - toute réponse authentifiée, toute écriture : « private, no-store » (jamais mise en cache par un CDN) ;
 * - lecture publique anonyme : cache CDN court (PUBLIC_CACHE_SECONDS) avec revalidation en arrière-plan.
 */
@Injectable()
export class CacheControlInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    const seconds = env().cache.publicSeconds;
    const cacheable = req.method === 'GET' && isPublic && !req.user && !req.cookies?.[env().cookieName] && seconds > 0;
    res.setHeader(
      'Cache-Control',
      cacheable ? `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds * 2}` : 'private, no-store',
    );
    if (cacheable) res.setHeader('Vary', 'Accept-Encoding');
    return next.handle();
  }
}

class ClientErrorDto {
  @IsString() @MaxLength(500) message: string;
  @IsOptional() @IsString() @MaxLength(300) url?: string;
  @IsOptional() @IsString() @MaxLength(2000) stack?: string;
  @IsOptional() @IsString() @MaxLength(100) digest?: string;
}

@ApiTags('Observabilité')
@Controller()
export class ObservabilityController {
  private readonly logger = new Logger('ClientError');

  constructor(private readonly prisma: PrismaService) {}

  /** Métriques Prometheus. Désactivé si METRICS_TOKEN est vide ; jeton comparé à temps constant. */
  @Public()
  @SkipThrottle()
  @Header('Content-Type', registry.contentType)
  @Get('metrics')
  async metrics(@Headers('authorization') auth?: string) {
    const token = env().observability.metricsToken;
    const given = auth?.startsWith('Bearer ') ? auth.slice(7) : '';
    const ok = token && given.length === token.length && timingSafeEqual(Buffer.from(given), Buffer.from(token));
    if (!ok) throw new NotFoundException();
    const prismaMetrics = await this.prisma.$metrics.prometheus();
    return (await registry.metrics()) + '\n' + prismaMetrics;
  }

  /** Erreurs JavaScript du site : comptées et journalisées (message tronqué, sans données de formulaire). */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(204)
  @Post('client-errors')
  clientError(@Body() dto: ClientErrorDto) {
    clientErrors.inc();
    this.logger.warn(JSON.stringify({ event: 'client_error', message: dto.message.slice(0, 200), url: dto.url?.split('?')[0], digest: dto.digest }));
  }
}

@Global()
@Module({
  controllers: [ObservabilityController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: CacheControlInterceptor }],
})
export class ObservabilityModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestMetricsMiddleware).forRoutes('*path');
  }
}

