import { Global, Module } from '@nestjs/common';
import { ProviderStatusController } from './provider-status.controller';
import { ProviderStatusService } from './provider-status.service';

@Global()
@Module({
  controllers: [ProviderStatusController],
  providers: [ProviderStatusService],
  exports: [ProviderStatusService],
})
export class ProvidersModule {}
