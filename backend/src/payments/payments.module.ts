import { Module } from '@nestjs/common';
import { CheckoutModule } from '../checkout/checkout.module';
import { OrderLifecycleModule } from '../orders/order-lifecycle.module';
import { PaymentGatewayRegistry } from './gateway.registry';
import { PaymentJobsService } from './payment-jobs.service';
import { AdminPaymentsController, PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { RefundsService } from './refunds.service';

@Module({
  imports: [OrderLifecycleModule, CheckoutModule],
  controllers: [PaymentsController, AdminPaymentsController],
  providers: [PaymentGatewayRegistry, PaymentsService, RefundsService, PaymentJobsService],
  exports: [PaymentsService, RefundsService, PaymentJobsService],
})
export class PaymentsModule {}
