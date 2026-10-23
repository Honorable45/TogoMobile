import { Body, ConflictException, Controller, Injectable, Module, NotFoundException, Post } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ReportTarget } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { IsEnum, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { AuditService } from '../common/audit.service';
import { AuthUser, CurrentUser } from '../common/auth.decorators';
import { TrimOrNull } from '../common/validators';
import { publicProductWhere } from '../common/visibility';
import { PrismaService } from '../prisma/prisma.service';

export const REPORT_REASONS = {
  FRAUD: 'Arnaque ou fraude suspectée',
  MISLEADING: 'Information trompeuse (prix, état, caractéristiques)',
  COUNTERFEIT: 'Contrefaçon ou produit interdit',
  STOLEN: 'Appareil possiblement volé',
  FAKE_REVIEW: 'Avis faux ou non authentique',
  ABUSIVE: 'Contenu injurieux ou inapproprié',
  NOT_RECEIVED: 'Vente contestée',
  OTHER: 'Autre motif',
} as const;

class CreateReportDto {
  @ApiProperty({ enum: ReportTarget }) @IsEnum(ReportTarget) targetType: ReportTarget;
  @ApiProperty() @IsString() @Length(1, 40) targetId: string;
  @ApiProperty({ enum: Object.keys(REPORT_REASONS) }) @IsIn(Object.keys(REPORT_REASONS), { message: 'Motif inconnu.' }) reason: string;
  @ApiPropertyOptional() @TrimOrNull() @IsOptional() @IsString() @MaxLength(1000) details?: string | null;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async targetExists(type: ReportTarget, id: string) {
    switch (type) {
      case 'PRODUCT':
        return this.prisma.product.count({ where: { id, ...publicProductWhere() } });
      case 'SHOP':
        return this.prisma.shop.count({ where: { id, status: { in: ['ACTIVE', 'CLOSED'] } } });
      case 'REVIEW':
        return this.prisma.review.count({ where: { id, status: 'PUBLISHED' } });
      case 'PROMOTION':
        return this.prisma.promotion.count({ where: { id } });
    }
  }

  async create(userId: string, dto: CreateReportDto) {
    if (!(await this.targetExists(dto.targetType, dto.targetId))) throw new NotFoundException('Contenu introuvable.');
    const existing = await this.prisma.report.findUnique({
      where: { authorId_targetType_targetId: { authorId: userId, targetType: dto.targetType, targetId: dto.targetId } },
    });
    if (existing) throw new ConflictException('Vous avez déjà signalé ce contenu. Notre équipe l’examine.');
    const report = await this.prisma.report.create({
      data: { authorId: userId, targetType: dto.targetType, targetId: dto.targetId, reason: dto.reason, details: dto.details ?? null },
    });
    await this.audit.log(userId, 'report.create', dto.targetType, dto.targetId, { reportId: report.id, reason: dto.reason });
    return { id: report.id, message: 'Merci, votre signalement a été transmis à l’équipe de modération.' };
  }
}

@ApiTags('Signalements')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReportDto) {
    return this.reports.create(user.id, dto);
  }
}

@Module({ providers: [ReportsService], controllers: [ReportsController] })
export class ReportsModule {}
