import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProductCondition } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PageQuery } from '../common/pagination';

const csv = () =>
  Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const arr = Array.isArray(value) ? value : String(value).split(',');
    return arr.map((v: string) => String(v).trim()).filter(Boolean);
  });

const csvInt = () =>
  Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const arr = Array.isArray(value) ? value : String(value).split(',');
    return arr.map((v: string) => Number(v)).filter((n: number) => Number.isFinite(n));
  });

const bool = () => Transform(({ value }) => value === true || value === 'true' || value === '1');

export const SORTS = ['recent', 'price_asc', 'price_desc', 'discount', 'rating', 'popular'] as const;
export type CatalogSort = (typeof SORTS)[number];

export class CatalogQuery extends PageQuery {
  @ApiPropertyOptional({ description: 'Recherche libre : marque, modèle, référence, caractéristiques' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: 'Slugs de marques séparés par des virgules' })
  @IsOptional()
  @csv()
  @IsArray()
  @IsString({ each: true })
  brand?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @ApiPropertyOptional({ description: 'Slug de la boutique' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  shop?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ enum: ProductCondition, isArray: true })
  @IsOptional()
  @csv()
  @IsArray()
  @IsEnum(ProductCondition, { each: true })
  condition?: ProductCondition[];

  @ApiPropertyOptional({ description: 'Capacités de stockage en Go, séparées par des virgules' })
  @IsOptional()
  @csvInt()
  @IsArray()
  @IsInt({ each: true })
  storage?: number[];

  @ApiPropertyOptional({ description: 'Mémoire vive en Go, séparée par des virgules' })
  @IsOptional()
  @csvInt()
  @IsArray()
  @IsInt({ each: true })
  ram?: number[];

  @ApiPropertyOptional({ description: 'Uniquement les téléphones disponibles' })
  @IsOptional()
  @bool()
  @IsBoolean()
  available?: boolean;

  @ApiPropertyOptional({ description: 'Uniquement les promotions en cours' })
  @IsOptional()
  @bool()
  @IsBoolean()
  promo?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({ enum: SORTS, default: 'recent' })
  @IsOptional()
  @IsIn(SORTS)
  sort: CatalogSort = 'recent';
}
