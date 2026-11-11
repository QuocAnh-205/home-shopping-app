import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { VouchersModule } from '../vouchers/vouchers.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';

@Module({
  imports: [CartModule, VouchersModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
  exports: [CheckoutService],
})
export class CheckoutModule {}
