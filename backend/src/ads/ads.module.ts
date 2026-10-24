import { Module } from '@nestjs/common';
import { AdminAdsController } from './ads.controller';
import { AdsService } from './ads.service';

@Module({ controllers: [AdminAdsController], providers: [AdsService], exports: [AdsService] })
export class AdsModule {}
