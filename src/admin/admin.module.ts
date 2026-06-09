import { Module } from '@nestjs/common';
import { AdminProviderOperationsController } from './admin-provider-operations.controller';
import { AdminProviderOperationsService } from './admin-provider-operations.service';

@Module({
  controllers: [AdminProviderOperationsController],
  providers: [AdminProviderOperationsService],
})
export class AdminModule {}
