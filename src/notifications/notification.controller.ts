import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data-interfaces';
import { MarkNotificationsReadDto } from './dto/mark-notifications-read.dto';
import { NotificationService } from './notification.service';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  getNotifications(@ActiveUser() user: ActiveUserData) {
    return this.notificationService.getUserNotifications(user.sub);
  }

  @Get(':id')
  getNotification(
    @ActiveUser() user: ActiveUserData,
    @Param('id') id: string,
  ) {
    return this.notificationService.getUserNotification(user.sub, id);
  }

  @Post('read')
  markRead(
    @ActiveUser() user: ActiveUserData,
    @Body() markNotificationsReadDto: MarkNotificationsReadDto,
  ) {
    return this.notificationService.markRead(user.sub, markNotificationsReadDto);
  }
}
