import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { AdminVouchersController, VouchersController } from './vouchers.controller';
import { VouchersService } from './vouchers.service';

@Module({
  imports: [OrdersModule],
  controllers: [VouchersController, AdminVouchersController],
  providers: [VouchersService],
  exports: [VouchersService],
})
export class VouchersModule {}
