import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Notification,
  NotificationStatus,
} from 'src/database/entities/notification.entity';
import { In, Repository } from 'typeorm';
import { AbstractRepository } from '../abstract.repository';

@Injectable()
export class NotificationRepository extends AbstractRepository<Notification> {
  protected readonly logger = new Logger(NotificationRepository.name);

  constructor(
    @InjectRepository(Notification)
    protected readonly notificationEntityRepository: Repository<Notification>,
  ) {
    super(notificationEntityRepository);
  }

  findForUser(userId: string) {
    return this.notificationEntityRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  findByIdForUser(userId: string, id: string) {
    return this.notificationEntityRepository.findOne({
      where: { id, userId },
    });
  }

  async markRead(userId: string, ids?: string[]) {
    const where = ids?.length ? { userId, id: In(ids) } : { userId };
    await this.notificationEntityRepository.update(where, {
      status: NotificationStatus.READ,
      readAt: new Date(),
    });
  }
}
