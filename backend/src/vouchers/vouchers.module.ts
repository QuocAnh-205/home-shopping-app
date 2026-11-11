import { Module } from '@nestjs/common';
import { OrderLifecycleModule } from '../orders/order-lifecycle.module';
import { AdminVouchersController, VouchersController } from './vouchers.controller';
import { VouchersService } from './vouchers.service';

@Module({
  imports: [OrderLifecycleModule],
  controllers: [VouchersController, AdminVouchersController],
  providers: [VouchersService],
  exports: [VouchersService],
})
export class VouchersModule {}
