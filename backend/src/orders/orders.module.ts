import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { ProductsModule } from '../products/products.module';
import { OrderJobsService } from './order-jobs.service';
import { OrderLifecycleService } from './order-lifecycle.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [CartModule, ProductsModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderLifecycleService, OrderJobsService],
  exports: [OrdersService, OrderLifecycleService, OrderJobsService],
})
export class OrdersModule {}
