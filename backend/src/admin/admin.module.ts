import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [OrdersModule, ProductsModule, ReviewsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
