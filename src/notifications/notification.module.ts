import { Global, Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { PushNotificationService } from './push-notification.service';
import { PushProviderGateway } from './push-provider.gateway';
import { PushNotificationAdminController } from './push-notification-admin.controller';

@Global()
@Module({
  controllers: [NotificationController, PushNotificationAdminController],
  providers: [
    NotificationService,
    PushNotificationService,
    PushProviderGateway,
  ],
  exports: [NotificationService, PushNotificationService],
})
export class NotificationModule {}
