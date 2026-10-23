import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ProductModeration, PromotionStatus, ReportStatus, ReviewStatus, SaleStatus, ShopStatus, UserStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { PageQuery } from '../common/pagination';
import { Trim } from '../common/validators';
import { AdminService } from './admin.service';

const bool = () => Transform(({ value }) => (value === undefined || value === '' ? undefined : value === true || value === 'true'));

class ShopsQuery extends PageQuery {
  @IsOptional() @IsEnum(ShopStatus) status?: ShopStatus;
  @IsOptional() @IsString() @MaxLength(80) q?: string;
  @IsOptional() @bool() @IsBoolean() pendingChanges?: boolean;
}
class UsersQuery extends PageQuery {
  @IsOptional() @IsString() @MaxLength(80) q?: string;
  @IsOptional() @IsIn(['CUSTOMER', 'SELLER', 'ADMIN']) role?: 'CUSTOMER' | 'SELLER' | 'ADMIN';
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
}
class ProductsQuery extends PageQuery {
  @IsOptional() @IsString() @MaxLength(80) q?: string;
  @IsOptional() @IsString() shopId?: string;
  @IsOptional() @bool() @IsBoolean() removed?: boolean;
  @IsOptional() @IsEnum(ProductModeration) moderation?: ProductModeration;
}
class PromotionsQuery extends PageQuery {
  @IsOptional() @IsEnum(PromotionStatus) status?: PromotionStatus;
  @IsOptional() @IsString() shopId?: string;
}
class ReviewsQuery extends PageQuery {
  @IsOptional() @IsEnum(ReviewStatus) status?: ReviewStatus;
}
class SalesQuery extends PageQuery {
  @IsOptional() @IsEnum(SaleStatus) status?: SaleStatus;
  @IsOptional() @IsString() shopId?: string;
}
class ReportsQuery extends PageQuery {
  @IsOptional() @IsEnum(ReportStatus) status?: ReportStatus;
}
class AuditQuery extends PageQuery {
  @IsOptional() @IsString() targetType?: string;
  @IsOptional() @IsString() targetId?: string;
  @IsOptional() @IsString() actorId?: string;
}

class ReasonDto {
  @ApiPropertyOptional() @Trim() @IsOptional() @IsString() @Length(3, 500) reason?: string;
}
class ShopStatusDto extends ReasonDto {
  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED', 'REJECTED', 'CHANGES_REQUESTED'] })
  @IsIn(['ACTIVE', 'SUSPENDED', 'REJECTED', 'CHANGES_REQUESTED'])
  status: ShopStatus;
}
class IdentityDto {
  @ApiProperty() @IsBoolean() verified: boolean;
  @ApiPropertyOptional() @Trim() @IsOptional() @IsString() @MaxLength(500) note?: string;
}
class TrustedDto {
  @ApiProperty() @IsBoolean() trusted: boolean;
  @ApiPropertyOptional() @Trim() @IsOptional() @IsString() @MaxLength(500) note?: string;
}
class ModerateProductDto {
  @ApiProperty() @IsBoolean() approve: boolean;
  @ApiPropertyOptional() @Trim() @IsOptional() @IsString() @Length(3, 500) note?: string;
}
class ChangesDecisionDto extends ReasonDto {
  @ApiProperty() @IsBoolean() approve: boolean;
}
class UserStatusDto extends ReasonDto {
  @ApiProperty({ enum: UserStatus }) @IsEnum(UserStatus) status: UserStatus;
}
class ModerateReviewDto {
  @ApiProperty({ enum: ['publish', 'hide', 'reject'] }) @IsIn(['publish', 'hide', 'reject']) action: 'publish' | 'hide' | 'reject';
  @ApiPropertyOptional() @Trim() @IsOptional() @IsString() @Length(3, 500) note?: string;
}
class SaleDecisionDto {
  @ApiProperty({ enum: ['verify', 'dispute', 'cancel'] }) @IsIn(['verify', 'dispute', 'cancel']) action: 'verify' | 'dispute' | 'cancel';
  @ApiPropertyOptional() @Trim() @IsOptional() @IsString() @Length(3, 500) note?: string;
}
class ResolveReportDto {
  @ApiProperty({ enum: ['RESOLVED', 'DISMISSED'] }) @IsIn(['RESOLVED', 'DISMISSED']) status: 'RESOLVED' | 'DISMISSED';
  @ApiProperty() @Trim() @IsString() @Length(3, 1000) decision: string;
}

@ApiTags('Administration')
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('shops') shops(@Query() q: ShopsQuery) { return this.admin.shops(q); }
  @Get('shops/:id') shop(@Param('id') id: string) { return this.admin.shop(id); }
  @HttpCode(200) @Post('shops/:id/status')
  shopStatus(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ShopStatusDto) {
    return this.admin.setShopStatus(u.id, id, dto.status, dto.reason);
  }
  @HttpCode(200) @Post('shops/:id/identity')
  identity(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: IdentityDto) {
    return this.admin.setShopIdentity(u.id, id, dto.verified, dto.note);
  }
  @HttpCode(200) @Post('shops/:id/trusted')
  trusted(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: TrustedDto) {
    return this.admin.setShopTrusted(u.id, id, dto.trusted, dto.note);
  }
  @HttpCode(200) @Post('shops/:id/changes')
  changes(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ChangesDecisionDto) {
    return this.admin.reviewShopChanges(u.id, id, dto.approve, dto.reason);
  }

  @Get('users') users(@Query() q: UsersQuery) { return this.admin.users(q); }
  @HttpCode(200) @Post('users/:id/status')
  userStatus(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UserStatusDto) {
    return this.admin.setUserStatus(u.id, id, dto.status, dto.reason);
  }

  @Get('products') products(@Query() q: ProductsQuery) { return this.admin.products(q); }
  @Get('products/:id') product(@Param('id') id: string) { return this.admin.productDetail(id); }
  @HttpCode(200) @Post('products/:id/remove')
  removeProduct(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.admin.removeProduct(u.id, id, dto.reason ?? '');
  }
  @HttpCode(200) @Post('products/:id/moderate')
  moderateProduct(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ModerateProductDto) {
    return this.admin.moderateProduct(u.id, id, dto.approve, dto.note);
  }
  @HttpCode(200) @Post('products/:id/restore')
  restoreProduct(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.admin.restoreProduct(u.id, id); }

  @Get('promotions') promotions(@Query() q: PromotionsQuery) { return this.admin.promotions(q); }
  @HttpCode(200) @Post('promotions/:id/suspend')
  suspendPromotion(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.admin.setPromotionStatus(u.id, id, true, dto.reason);
  }
  @HttpCode(200) @Post('promotions/:id/reinstate')
  reinstatePromotion(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.admin.setPromotionStatus(u.id, id, false); }

  @Get('reviews') reviews(@Query() q: ReviewsQuery) { return this.admin.reviewsList(q); }
  @HttpCode(200) @Post('reviews/:id/moderate')
  moderate(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ModerateReviewDto) {
    return this.admin.moderateReview(u.id, id, dto.action, dto.note);
  }

  @Get('sales') sales(@Query() q: SalesQuery) { return this.admin.salesList(q); }
  @HttpCode(200) @Post('sales/:id/decision')
  saleDecision(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: SaleDecisionDto) {
    return this.admin.decideSale(u.id, id, dto.action, dto.note);
  }

  @Get('reports') reports(@Query() q: ReportsQuery) { return this.admin.reports(q); }
  @HttpCode(200) @Post('reports/:id/resolve')
  resolve(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ResolveReportDto) {
    return this.admin.resolveReport(u.id, id, dto.status, dto.decision);
  }

  @Get('audit-logs') audit(@Query() q: AuditQuery) { return this.admin.auditLogs(q); }

  /** Aide au réglage de TRUST_PROXY_HOPS : l'adresse retenue doit être celle de votre propre connexion. */
  @Get('debug/client-ip')
  clientIp(@Req() req: Request) {
    return { ip: req.ip, forwardedFor: req.headers['x-forwarded-for'] ?? null, trustProxyHops: req.app.get('trust proxy') };
  }
}
