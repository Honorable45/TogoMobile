import { Module } from '@nestjs/common';
import { SalesModule } from '../sales/sales.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({ imports: [SalesModule], providers: [AdminService], controllers: [AdminController] })
export class AdminModule {}
