import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, ApiTags, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Length, MaxLength, Min } from 'class-validator';
import { AuthUser, CurrentUser, Public, Roles } from '../common/auth.decorators';
import { PageQuery } from '../common/pagination';
import { TrimOrNull } from '../common/validators';
import { PromotionsService } from './promotions.service';

export class CreatePromotionDto {
  @ApiProperty() @IsString() @Length(1, 40) productId: string;

  @ApiProperty({ example: 85000, description: 'Prix promotionnel en FCFA' })
  @Type(() => Number)
  @IsInt({ message: 'Le prix promotionnel doit être un nombre entier de FCFA.' })
  @Min(1, { message: 'Le prix promotionnel doit être strictement positif.' })
  promoPrice: number;

  @ApiPropertyOptional({ description: 'Début (ISO 8601). Par défaut : immédiatement.' })
  @IsOptional()
  @IsDateString({}, { message: 'Date de début invalide.' })
  startsAt?: string;

  @ApiProperty({ description: 'Fin (ISO 8601)' })
  @IsDateString({}, { message: 'Date de fin invalide.' })
  endsAt: string;

  @ApiPropertyOptional({ example: 'Dans la limite du stock disponible' })
  @TrimOrNull()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  conditions?: string | null;
}

class UpdatePromotionDto extends PartialType(CreatePromotionDto) {}

class PromotionListQuery extends PageQuery {
  @IsOptional() @IsString() @MaxLength(80) shop?: string;
}

class SellerPromotionQuery extends PageQuery {
  @IsOptional() @IsString() @MaxLength(40) productId?: string;
}

@ApiTags('Promotions (public)')
@Public()
@Controller('promotions')
export class PublicPromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get()
  list(@Query() q: PromotionListQuery) {
    return this.promotions.publicList(q);
  }
}

@ApiTags('Espace vendeur — promotions')
@Roles('SELLER')
@Controller('seller/promotions')
export class SellerPromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: SellerPromotionQuery) {
    return this.promotions.sellerList(user.id, q);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePromotionDto) {
    return this.promotions.create(user.id, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdatePromotionDto) {
    const { productId: _ignored, ...rest } = dto;
    return this.promotions.update(user.id, id, rest);
  }

  @HttpCode(200)
  @Post(':id/disable')
  disable(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.promotions.disable(user.id, id);
  }

  @Get(':id/history')
  history(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.promotions.history(user.id, id);
  }
}
