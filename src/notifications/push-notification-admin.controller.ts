import { Controller, Post } from '@nestjs/common';
import { Role } from 'src/common/enum/role.enum';
import { Roles } from 'src/iam/decorators/roles.decorator';
import { PushNotificationService } from './push-notification.service';

@Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.SETTLEMENT)
@Controller('admin/push-notifications')
export class PushNotificationAdminController {
  constructor(private readonly service: PushNotificationService) {}

  @Post('process-due')
  processDue() {
    return this.service.processDue();
  }
}
