import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationStatus,
} from 'src/database/entities/notification.entity';
import { NotificationRepository } from 'src/database/repositories/notification.repository';
import { MarkNotificationsReadDto } from './dto/mark-notifications-read.dto';
import { PushNotificationService } from './push-notification.service';

interface CreateNotificationInput {
  userId: string;
  title: string;
  body: string;
  type: string;
  channel?: NotificationChannel;
  metadata?: Record<string, any> | null;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly notificationRepository: NotificationRepository,
    private readonly pushNotificationService: PushNotificationService,
  ) {}

  async create(input: CreateNotificationInput) {
    const notification = await this.notificationRepository.create({
      userId: input.userId,
      title: input.title,
      body: input.body,
      type: input.type,
      channel: input.channel ?? NotificationChannel.IN_APP,
      status: NotificationStatus.UNREAD,
      metadata: input.metadata ?? null,
      deliveredAt: new Date(),
    });
    try {
      await this.pushNotificationService.queueForNotification(notification);
    } catch (error) {
      this.logger.error(
        `Failed to queue push for notification ${notification.id}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
    return notification;
  }

  getUserNotifications(userId: string) {
    return this.notificationRepository.findForUser(userId);
  }

  async getUserNotification(userId: string, id: string) {
    const notification = await this.notificationRepository.findByIdForUser(
      userId,
      id,
    );

    if (!notification) {
      throw new NotFoundException('Notification not found.');
    }

    return notification;
  }

  async markRead(userId: string, dto: MarkNotificationsReadDto) {
    await this.notificationRepository.markRead(userId, dto.notificationIds);

    return {
      message: 'Notifications marked as read.',
      notificationIds: dto.notificationIds ?? null,
      readAt: new Date().toISOString(),
    };
  }
}
