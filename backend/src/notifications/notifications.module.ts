import { Global, Module } from '@nestjs/common';
import { OrderLifecycleModule } from '../orders/order-lifecycle.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/** Global: thanh toán, hoàn tiền, xu… gọi NotificationsService.notify mà không phải import module */
@Global()
@Module({
  imports: [OrderLifecycleModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
