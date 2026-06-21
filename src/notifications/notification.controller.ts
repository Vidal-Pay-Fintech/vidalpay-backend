import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data-interfaces';
import { MarkNotificationsReadDto } from './dto/mark-notifications-read.dto';
import { NotificationService } from './notification.service';
import {
  RegisterPushDeviceDto,
  UpdateNotificationPreferencesDto,
} from './dto/push-notification.dto';
import { PushNotificationService } from './push-notification.service';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly pushNotificationService: PushNotificationService,
  ) {}

  @Get()
  getNotifications(@ActiveUser() user: ActiveUserData) {
    return this.notificationService.getUserNotifications(user.sub);
  }

  @Post('devices')
  registerDevice(
    @ActiveUser() user: ActiveUserData,
    @Body() dto: RegisterPushDeviceDto,
  ) {
    return this.pushNotificationService.registerDevice(user.sub, dto);
  }

  @Get('devices')
  listDevices(@ActiveUser() user: ActiveUserData) {
    return this.pushNotificationService.listDevices(user.sub);
  }

  @Post('devices/:id/revoke')
  revokeDevice(@ActiveUser() user: ActiveUserData, @Param('id') id: string) {
    return this.pushNotificationService.revokeDevice(user.sub, id);
  }

  @Get('preferences')
  getPreferences(@ActiveUser() user: ActiveUserData) {
    return this.pushNotificationService.getPreferences(user.sub);
  }

  @Post('preferences')
  updatePreferences(
    @ActiveUser() user: ActiveUserData,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.pushNotificationService.updatePreferences(user.sub, dto);
  }

  @Get(':id')
  getNotification(@ActiveUser() user: ActiveUserData, @Param('id') id: string) {
    return this.notificationService.getUserNotification(user.sub, id);
  }

  @Post('read')
  markRead(
    @ActiveUser() user: ActiveUserData,
    @Body() markNotificationsReadDto: MarkNotificationsReadDto,
  ) {
    return this.notificationService.markRead(
      user.sub,
      markNotificationsReadDto,
    );
  }
}
