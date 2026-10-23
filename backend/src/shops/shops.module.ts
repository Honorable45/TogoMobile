import { Module } from '@nestjs/common';
import { SellerShopController, ShopsPublicController } from './shops.controller';
import { ShopsService } from './shops.service';

@Module({
  providers: [ShopsService],
  controllers: [ShopsPublicController, SellerShopController],
  exports: [ShopsService],
})
export class ShopsModule {}
