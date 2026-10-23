import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient | PrismaService;

/** Journal d'audit. Ne jamais y placer de mot de passe, jeton ou numéro de téléphone en clair. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  async log(
    actorId: string | null | undefined,
    action: string,
    targetType: string,
    targetId?: string | null,
    metadata: Record<string, unknown> = {},
    tx: Tx = this.prisma,
  ) {
    try {
      await tx.auditLog.create({
        data: {
          actorId: actorId ?? null,
          action,
          targetType,
          targetId: targetId ?? null,
          metadata: metadata as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      // L'audit ne doit pas masquer l'erreur d'origine ; on le signale dans les journaux.
      this.logger.error(`Échec d'écriture du journal d'audit (${action})`, e as Error);
      if (tx !== this.prisma) throw e;
    }
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
