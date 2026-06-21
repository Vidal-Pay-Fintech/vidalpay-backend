import { Module } from '@nestjs/common';
import { ScheduledPaymentAdminController } from './scheduled-payment-admin.controller';
import { ScheduledPaymentController } from './scheduled-payment.controller';
import { ScheduledPaymentService } from './scheduled-payment.service';

@Module({
  controllers: [ScheduledPaymentController, ScheduledPaymentAdminController],
  providers: [ScheduledPaymentService],
})
export class ScheduledPaymentModule {}
