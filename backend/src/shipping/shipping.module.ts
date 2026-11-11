import { Global, Module } from '@nestjs/common';
import { ShippingService } from './shipping.service';

@Global()
@Module({
  providers: [ShippingService],
  exports: [ShippingService],
})
export class ShippingModule {}
