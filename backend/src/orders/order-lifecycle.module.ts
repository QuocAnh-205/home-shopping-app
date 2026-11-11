import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { OrderLifecycleService } from './order-lifecycle.service';

/** Tách riêng để voucher / thanh toán gắn hook vào vòng đời đơn mà không phụ thuộc vòng với OrdersModule */
@Module({
  imports: [ProductsModule],
  providers: [OrderLifecycleService],
  exports: [OrderLifecycleService],
})
export class OrderLifecycleModule {}
