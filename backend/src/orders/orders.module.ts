import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { CheckoutModule } from '../checkout/checkout.module';
import { ProductsModule } from '../products/products.module';
import { VouchersModule } from '../vouchers/vouchers.module';
import { OrderJobsService } from './order-jobs.service';
import { OrderLifecycleModule } from './order-lifecycle.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [CartModule, ProductsModule, OrderLifecycleModule, CheckoutModule, VouchersModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderJobsService],
  exports: [OrdersService, OrderJobsService, OrderLifecycleModule],
})
export class OrdersModule {}
