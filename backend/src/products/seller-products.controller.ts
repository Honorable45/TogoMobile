import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { env } from '../config/env';
import { MediaService } from '../media/media.service';
import { CreateProductDto, CreateUploadDto, MediaOrderDto, SellerProductsQuery, StockDto, UpdateProductDto } from './product.dto';
import { SellerProductsService } from './seller-products.service';

@ApiTags('Espace vendeur — produits')
@Roles('SELLER')
@Controller('seller/products')
export class SellerProductsController {
  constructor(
    private readonly products: SellerProductsService,
    private readonly media: MediaService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: SellerProductsQuery) {
    return this.products.list(user.id, q);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.products.create(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.products.get(user.id, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.media.deleteDraft(user.id, id);
  }

  @Patch(':id/stock')
  stock(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: StockDto) {
    return this.products.updateStock(user.id, id, dto);
  }

  @HttpCode(200)
  @Post(':id/publish')
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.products.publish(user.id, id);
  }

  @HttpCode(200)
  @Post(':id/unpublish')
  unpublish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.products.unpublish(user.id, id);
  }

  /** Étape 1 : autorisation d'envoi direct vers le stockage (URL présignée, valable quelques minutes). */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(':id/media/uploads')
  createUpload(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateUploadDto) {
    return this.media.createUpload(user.id, id, dto);
  }

  /** Étape 3 : finalisation après l'envoi ; le traitement est ensuite asynchrone. */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post(':id/media/uploads/:uploadId/complete')
  completeUpload(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('uploadId') uploadId: string) {
    return this.media.completeUpload(user.id, id, uploadId);
  }

  /** Envoi par l'API (compatibilité). Préférer l'envoi direct, qui ne transite pas par la mémoire de l'API. */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: env().media.maxVideoBytes, files: 1 } }))
  @Post(':id/media')
  addMedia(@CurrentUser() user: AuthUser, @Param('id') id: string, @UploadedFile() file?: { buffer: Buffer }) {
    if (!file) throw new BadRequestException('Aucun fichier reçu.');
    return this.media.addDirect(user.id, id, file.buffer);
  }

  @Put(':id/media/order')
  reorder(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MediaOrderDto) {
    return this.media.reorder(user.id, id, dto.order, dto.primaryId);
  }

  @Delete(':id/media/:mediaId')
  removeMedia(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('mediaId') mediaId: string) {
    return this.media.remove(user.id, id, mediaId);
  }
}
