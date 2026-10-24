import { AdsModule } from '../ads/ads.module';
import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { PublicProductsService } from './public-products.service';

@Module({ imports: [AdsModule], providers: [CatalogService, PublicProductsService], controllers: [CatalogController] })
export class CatalogModule {}
