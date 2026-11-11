import { Module } from '@nestjs/common';
import { OrderLifecycleModule } from '../orders/order-lifecycle.module';
import { AdminReturnsController, ReturnsController } from './returns.controller';
import { ReturnsService } from './returns.service';

@Module({
  imports: [OrderLifecycleModule],
  controllers: [ReturnsController, AdminReturnsController],
  providers: [ReturnsService],
})
export class ReturnsModule {}
