import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser, Public, Roles } from '../common/auth.decorators';
import { PageQuery } from '../common/pagination';
import { env } from '../config/env';
import { CreateShopDto, UpdateShopDto } from './shop.dto';
import { ShopsService } from './shops.service';

class ShopListQuery extends PageQuery {
  @IsOptional() @IsString() @MaxLength(80) q?: string;
  @IsOptional() @IsString() @MaxLength(60) city?: string;
  @IsOptional() @IsIn(['recent', 'rating', 'name']) sort?: string;
}

export const imageUpload = () =>
  FileInterceptor('file', { limits: { fileSize: env().media.maxImageBytes, files: 1 } });

@ApiTags('Boutiques (public)')
@Public()
@Controller('shops')
export class ShopsPublicController {
  constructor(private readonly shops: ShopsService) {}

  @Get()
  list(@Query() q: ShopListQuery) {
    return this.shops.list(q);
  }

  @Get(':slug')
  get(@Param('slug') slug: string) {
    return this.shops.publicShop(slug);
  }
}

@ApiTags('Espace vendeur — boutique')
@Controller('seller/shop')
export class SellerShopController {
  constructor(private readonly shops: ShopsService) {}

  /** Demande d'ouverture de boutique (tout client connecté). */
  @Post()
  apply(@CurrentUser() user: AuthUser, @Body() dto: CreateShopDto) {
    return this.shops.apply(user.id, dto);
  }

  @Roles('SELLER')
  @Get()
  mine(@CurrentUser() user: AuthUser) {
    return this.shops.getMine(user.id);
  }

  @Roles('SELLER')
  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateShopDto) {
    return this.shops.update(user.id, dto);
  }

  @Roles('SELLER')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(imageUpload())
  @Post('logo')
  logo(@CurrentUser() user: AuthUser, @UploadedFile() file?: { buffer: Buffer }) {
    if (!file) throw new BadRequestException('Aucun fichier reçu.');
    return this.shops.setLogo(user.id, file.buffer);
  }

  @Roles('SELLER')
  @HttpCode(200)
  @Post('close')
  close(@CurrentUser() user: AuthUser) {
    return this.shops.setOpen(user.id, false);
  }

  @Roles('SELLER')
  @HttpCode(200)
  @Post('reopen')
  reopen(@CurrentUser() user: AuthUser) {
    return this.shops.setOpen(user.id, true);
  }
}
