import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/auth.decorators';
import { CatalogQuery } from './catalog.dto';
import { CatalogService } from './catalog.service';
import { PublicProductsService } from './public-products.service';

@ApiTags('Catalogue (public)')
@Public()
@Controller()
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly products: PublicProductsService,
  ) {}

  @Get('home')
  home() {
    return this.products.home();
  }

  @Get('catalog/products')
  search(@Query() q: CatalogQuery) {
    return this.catalog.search(q);
  }

  @Get('products/:slug')
  detail(@Param('slug') slug: string) {
    return this.products.detail(slug);
  }

  @Get('products/:slug/similar')
  similar(@Param('slug') slug: string) {
    return this.products.similar(slug);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post('products/:id/whatsapp')
  whatsapp(@Param('id') id: string) {
    return this.products.whatsapp(id);
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(204)
  @Post('products/:id/view')
  view(@Param('id') id: string) {
    return this.products.view(id);
  }
}
