import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { authFailures } from '../observability/metrics';
import { env } from '../config/env';
import { AuditService } from '../common/audit.service';
import { hashPassword, randomToken, sha256, verifyPassword } from '../common/crypto';
import { normalizePhone } from '../common/phone';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto, RegisterDto, UpdateProfileDto } from './auth.dto';
import { MailService } from './mail.service';
import { SessionService } from './session.service';

const RESET_TTL_MS = 60 * 60 * 1000;
// Empreinte factice : égalise le temps de réponse lorsque le compte n'existe pas.
const DUMMY_HASH = 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$' + 'A'.repeat(86);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email?.toLowerCase();
    const phone = normalizePhone(dto.phone);
    if (!email && !phone) {
      throw new BadRequestException('Renseignez une adresse e-mail ou un numéro de téléphone.');
    }
    const existing = await this.prisma.user.findFirst({
      where: { OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])] },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Un compte existe déjà avec cet e-mail ou ce numéro.');

    // Le rôle n'est jamais accepté depuis la requête : tout nouveau compte est un compte client.
    const user = await this.prisma.user.create({
      data: { name: dto.name, email, phone, passwordHash: await hashPassword(dto.password), role: 'CUSTOMER' },
      select: { id: true },
    });
    await this.audit.log(user.id, 'user.register', 'User', user.id);
    return user;
  }

  async validateCredentials(identifier: string, password: string) {
    const id = identifier.trim();
    const phone = normalizePhone(id);
    const user = await this.prisma.user.findFirst({
      where: id.includes('@') ? { email: id.toLowerCase() } : { phone: phone ?? '__invalid__' },
    });
    // Compte temporairement verrouillé : on ne vérifie même pas le mot de passe.
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      authFailures.inc({ reason: 'locked' });
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new HttpException(
        { message: `Trop de tentatives de connexion sur ce compte. Réessayez dans ${minutes} min ou réinitialisez votre mot de passe.`, code: 'ACCOUNT_LOCKED' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      authFailures.inc({ reason: 'credentials' });
      if (user) await this.recordFailure(user.id);
      throw new UnauthorizedException('Identifiants incorrects.');
    }
    if (user.status !== 'ACTIVE') {
      authFailures.inc({ reason: 'suspended' });
      throw new UnauthorizedException('Ce compte est suspendu. Contactez le support de la plateforme.');
    }
    if (user.failedLoginCount || user.lockedUntil) {
      await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
    }
    return user;
  }

  /** Échec de connexion sur un compte existant : compteur atomique, verrouillage temporaire au seuil. */
  private async recordFailure(userId: string) {
    const { loginMaxFailures, loginLockMinutes } = env().security;
    const u = await this.prisma.user.update({ where: { id: userId }, data: { failedLoginCount: { increment: 1 } }, select: { failedLoginCount: true } });
    if (u.failedLoginCount >= loginMaxFailures) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + loginLockMinutes * 60_000) },
      });
      await this.audit.log(userId, 'user.locked', 'User', userId, { minutes: loginLockMinutes });
    }
  }

  async me(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
        shop: { select: { id: true, name: true, slug: true, status: true } },
      },
    });
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const email = dto.email?.toLowerCase();
    const phone = dto.phone ? normalizePhone(dto.phone) : undefined;
    if (email || phone) {
      const clash = await this.prisma.user.findFirst({
        where: { id: { not: userId }, OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])] },
        select: { id: true },
      });
      if (clash) throw new ConflictException('Cet e-mail ou ce numéro est déjà utilisé.');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { name: dto.name, email, phone } });
    return this.me(userId);
  }

  async changePassword(userId: string, sessionId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await verifyPassword(dto.currentPassword, user.passwordHash))) {
      throw new BadRequestException('Le mot de passe actuel est incorrect.');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(dto.newPassword) } });
    // Les autres appareils sont déconnectés.
    await this.sessions.revokeAll(userId, sessionId);
    await this.audit.log(userId, 'user.password_change', 'User', userId);
  }

  async forgotPassword(emailInput: string) {
    const email = emailInput.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Réponse identique que le compte existe ou non (pas d'énumération).
    if (!user || user.status !== 'ACTIVE') return;

    const token = randomToken();
    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
    });
    const link = `${env().webUrl}/reinitialiser-mot-de-passe?token=${encodeURIComponent(token)}`;
    await this.mail.send({
      to: email,
      subject: 'Réinitialisation de votre mot de passe',
      text:
        `Bonjour ${user.name},\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable une heure) :\n${link}\n\n` +
        "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
    });
    await this.audit.log(user.id, 'user.password_reset_request', 'User', user.id);
  }

  async resetPassword(token: string, password: string) {
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      throw new BadRequestException('Ce lien de réinitialisation est invalide ou expiré.');
    }
    // Consommation atomique : un lien ne sert qu'une fois.
    const consumed = await this.prisma.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) throw new BadRequestException('Ce lien de réinitialisation a déjà été utilisé.');

    await this.prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(password), failedLoginCount: 0, lockedUntil: null },
    });
    await this.sessions.revokeAll(record.userId);
    await this.audit.log(record.userId, 'user.password_reset', 'User', record.userId);
  }

  listSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, userAgent: true, createdAt: true, lastUsedAt: true },
      orderBy: { lastUsedAt: 'desc' },
    });
  }

  async revokeSession(userId: string, sessionId: string) {
    const r = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revoked: r.count === 1 };
  }
}
