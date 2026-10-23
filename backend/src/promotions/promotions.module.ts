import { Module } from '@nestjs/common';
import { ShopsModule } from '../shops/shops.module';
import { PublicPromotionsController, SellerPromotionsController } from './promotions.controller';
import { PromotionsService } from './promotions.service';

@Module({
  imports: [ShopsModule],
  providers: [PromotionsService],
  controllers: [PublicPromotionsController, SellerPromotionsController],
})
export class PromotionsModule {}
