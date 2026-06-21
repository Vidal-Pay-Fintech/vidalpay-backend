import { Module } from '@nestjs/common';
import { AdminProviderOperationsController } from './admin-provider-operations.controller';
import { AdminProviderOperationsService } from './admin-provider-operations.service';
import { AdminUserManagementController } from './admin-user-management.controller';
import { AdminUserManagementService } from './admin-user-management.service';

@Module({
  controllers: [
    AdminProviderOperationsController,
    AdminUserManagementController,
  ],
  providers: [AdminProviderOperationsService, AdminUserManagementService],
})
export class AdminModule {}
