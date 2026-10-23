import { Module } from '@nestjs/common';
import { MediaService } from '../media/media.service';
import { UploadsController } from '../media/uploads.controller';
import { ShopsModule } from '../shops/shops.module';
import { SellerProductsController } from './seller-products.controller';
import { SellerProductsService } from './seller-products.service';

@Module({
  imports: [ShopsModule],
  providers: [SellerProductsService, MediaService],
  controllers: [SellerProductsController, UploadsController],
})
export class ProductsModule {}
