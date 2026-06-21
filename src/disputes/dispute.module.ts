import { Module } from '@nestjs/common';
import { DisputeAdminController } from './dispute-admin.controller';
import { DisputeController, RefundController } from './dispute.controller';
import { DisputeProviderGateway } from './dispute-provider.gateway';
import { DisputeService } from './dispute.service';

@Module({
  controllers: [DisputeController, RefundController, DisputeAdminController],
  providers: [DisputeService, DisputeProviderGateway],
})
export class DisputeModule {}
