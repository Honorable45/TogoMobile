import { BadRequestException } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { env } from '../config/env';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PageQuery {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page: number = 1;

  @ApiPropertyOptional({ default: 24, minimum: 1, maximum: 60 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  pageSize: number = 24;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function paged<T>(items: T[], total: number, page: number, pageSize: number): Page<T> {
  return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/**
 * Pagination par décalage, bornée : au-delà de PAGINATION_MAX_OFFSET lignes, PostgreSQL devrait parcourir
 * puis ignorer des milliers de lignes ; l'utilisateur est invité à affiner sa recherche.
 */
export function skipTake(q: { page: number; pageSize: number }) {
  const skip = (q.page - 1) * q.pageSize;
  if (skip > env().maxOffset) {
    throw new BadRequestException('Page trop éloignée : affinez votre recherche avec les filtres.');
  }
  return { skip, take: q.pageSize };
}
