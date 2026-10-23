import { Module } from '@nestjs/common';
import { ReviewVerificationService } from '../reviews/review-verification.service';
import { ReviewsService } from '../reviews/reviews.service';
import { ShopsModule } from '../shops/shops.module';
import { PublicReviewsController, ReviewTokensController, SellerSalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [ShopsModule],
  providers: [SalesService, ReviewsService, ReviewVerificationService],
  controllers: [SellerSalesController, ReviewTokensController, PublicReviewsController],
  exports: [ReviewsService],
})
export class SalesModule {}
