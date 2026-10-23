import { Injectable } from '@nestjs/common';
import type { Response, CookieOptions } from 'express';
import { env } from '../config/env';
import { randomToken, sha256 } from '../common/crypto';
import { AuthUser } from '../common/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Sessions opaques côté serveur : le navigateur ne détient qu'un jeton aléatoire dans un cookie httpOnly,
 * la base n'en conserve que l'empreinte SHA-256. Révocation immédiate possible.
 */
@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  cookieOptions(): CookieOptions {
    const e = env();
    return {
      httpOnly: true,
      secure: e.isProd || e.cookieSameSite === 'none',
      sameSite: e.cookieSameSite,
      domain: e.cookieDomain,
      path: '/',
      maxAge: e.sessionDays * 24 * 3600 * 1000,
    };
  }

  async create(userId: string, userAgent: string | undefined, res: Response) {
    const token = randomToken();
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: sha256(token),
        userAgent: userAgent?.slice(0, 300),
        expiresAt: new Date(Date.now() + env().sessionDays * 24 * 3600 * 1000),
      },
    });
    res.cookie(env().cookieName, token, this.cookieOptions());
  }

  clearCookie(res: Response) {
    const { maxAge: _maxAge, ...opts } = this.cookieOptions();
    res.clearCookie(env().cookieName, opts);
  }

  async resolve(token: string): Promise<AuthUser | null> {
    if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: { select: { id: true, name: true, role: true, status: true } } },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
    if (session.user.status !== 'ACTIVE') return null;

    if (Date.now() - session.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
    }
    return { id: session.user.id, name: session.user.name, role: session.user.role, sessionId: session.id };
  }

  revoke(sessionId: string) {
    return this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  revokeAll(userId: string, exceptSessionId?: string) {
    return this.prisma.session.updateMany({
      where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
      data: { revokedAt: new Date() },
    });
  }
}
