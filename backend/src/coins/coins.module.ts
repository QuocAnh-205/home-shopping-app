import { Global, Module } from '@nestjs/common';
import { OrderLifecycleModule } from '../orders/order-lifecycle.module';
import { CoinsController } from './coins.controller';
import { CoinsService } from './coins.service';

@Global()
@Module({
  imports: [OrderLifecycleModule],
  controllers: [CoinsController],
  providers: [CoinsService],
  exports: [CoinsService],
})
export class CoinsModule {}
