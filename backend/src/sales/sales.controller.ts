import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { SaleStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, CurrentUser, Public, Roles } from '../common/auth.decorators';
import { PageQuery } from '../common/pagination';
import { IsPhone, Trim, TrimOrNull } from '../common/validators';
import { ReviewVerificationService } from '../reviews/review-verification.service';
import { ReviewsService } from '../reviews/reviews.service';
import { ShopsService } from '../shops/shops.service';
import { SalesService } from './sales.service';

class DeclareSaleDto {
  @ApiProperty() @IsString() @Length(1, 40) productId: string;
  @ApiProperty({ description: 'Date de la vente (ISO 8601)' }) @IsDateString({}, { message: 'Date de vente invalide.' }) soldAt: string;

  @ApiProperty({ example: 'FAC-2026-0142', description: 'Référence interne de la transaction (reçu, facture…)' })
  @Trim()
  @IsString()
  @Length(2, 40)
  @Matches(/^[\w\-/. #]+$/u, { message: 'La référence ne peut contenir que des lettres, chiffres, espaces et - / . #' })
  internalRef: string;

  @ApiPropertyOptional({ description: 'Montant convenu (FCFA)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50_000_000)
  amount?: number;

  @ApiProperty({ description: 'Numéro de l’acheteur : seul un HMAC est conservé ; le client devra le confirmer.' })
  @Trim()
  @IsPhone()
  buyerPhone: string;
}

class SalesQuery extends PageQuery {
  @IsOptional() @IsEnum(SaleStatus) status?: SaleStatus;
}

class TokenDto {
  @ApiProperty() @IsString() @Length(30, 100) token: string;
}

class SubmitReviewDto extends TokenDto {
  @ApiProperty({ description: 'Numéro de téléphone communiqué au vendeur lors de l’achat' })
  @Trim()
  @IsString()
  @MaxLength(30)
  buyerPhone: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'La note doit être comprise entre 1 et 5.' })
  @Max(5, { message: 'La note doit être comprise entre 1 et 5.' })
  rating: number;

  @ApiPropertyOptional({ maxLength: 1000 })
  @TrimOrNull()
  @IsOptional()
  @IsString()
  @Length(10, 1000, { message: 'Le commentaire doit contenir entre 10 et 1 000 caractères.' })
  comment?: string | null;
}

@ApiTags('Espace vendeur — ventes et QR codes')
@Roles('SELLER')
@Controller('seller')
export class SellerSalesController {
  constructor(
    private readonly sales: SalesService,
    private readonly reviews: ReviewsService,
    private readonly shops: ShopsService,
  ) {}

  @Get('sales')
  list(@CurrentUser() user: AuthUser, @Query() q: SalesQuery) {
    return this.sales.list(user.id, q);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('sales')
  declare(@CurrentUser() user: AuthUser, @Body() dto: DeclareSaleDto) {
    return this.sales.declare(user.id, dto);
  }

  @Get('sales/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sales.get(user.id, id);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('sales/:id/qr')
  regenerate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sales.regenerate(user.id, id);
  }

  @HttpCode(200)
  @Post('sales/:id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sales.cancel(user.id, id);
  }

  @Get('reviews')
  async reviewsList(@CurrentUser() user: AuthUser, @Query() q: PageQuery) {
    const shop = await this.shops.ownedShop(user.id);
    return this.reviews.forSeller(shop.id, q);
  }
}

/** Parcours client du QR code. Le jeton est transmis dans le corps de la requête, jamais dans l'URL. */
@ApiTags('Vérification des achats et avis')
@Controller('review-tokens')
export class ReviewTokensController {
  constructor(private readonly verification: ReviewVerificationService) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post('check')
  check(@Body() dto: TokenDto) {
    return this.verification.check(dto.token);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('submit')
  submit(@CurrentUser() user: AuthUser, @Body() dto: SubmitReviewDto) {
    return this.verification.submit(user.id, dto.token, dto);
  }
}

@ApiTags('Avis (public)')
@Public()
@Controller()
export class PublicReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('products/:slug/reviews')
  product(@Param('slug') slug: string, @Query() q: PageQuery) {
    return this.reviews.forProduct(slug, q);
  }

  @Get('shops/:slug/reviews')
  shop(@Param('slug') slug: string, @Query() q: PageQuery) {
    return this.reviews.forShop(slug, q);
  }
}
