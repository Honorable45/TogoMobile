import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import { env } from '../config/env';
import { SessionService } from '../auth/session.service';
import { AuthedRequest, IS_PUBLIC, ROLES } from './auth.decorators';

/**
 * Garde globale : identifie l'utilisateur à partir du cookie de session httpOnly,
 * puis applique @Public() et @Roles().
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = req.cookies?.[env().cookieName];
    if (token) {
      const user = await this.sessions.resolve(token);
      if (user) req.user = user;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES, [ctx.getHandler(), ctx.getClass()]);

    if (!req.user) {
      if (isPublic && !roles?.length) return true;
      throw new UnauthorizedException('Veuillez vous connecter pour continuer.');
    }
    if (roles?.length && !roles.includes(req.user.role)) {
      throw new ForbiddenException("Vous n'avez pas accès à cette ressource.");
    }
    return true;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Protection CSRF : les requêtes qui modifient des données et portent un en-tête Origin
 * doivent provenir d'une origine autorisée. Complète le cookie SameSite.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowed = new Set([...env().corsOrigins, env().webUrl, env().apiUrl]);

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (SAFE_METHODS.has(req.method)) return true;
    const origin = req.headers.origin;
    if (!origin) return true; // clients non navigateurs : le cookie SameSite empêche l'usage intersite
    if (this.allowed.has(origin.replace(/\/$/, ''))) return true;
    throw new ForbiddenException('Origine de la requête non autorisée.');
  }
}
