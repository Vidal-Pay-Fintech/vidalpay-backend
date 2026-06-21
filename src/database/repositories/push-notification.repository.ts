import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DeepPartial, LessThanOrEqual, Repository } from 'typeorm';
import { PushDeliveryStatus } from 'src/notifications/push-notification.enums';
import { DeviceToken } from '../entities/device-token.entity';
import { Notification } from '../entities/notification.entity';
import { NotificationPreference } from '../entities/notification-preference.entity';
import { PushDelivery } from '../entities/push-delivery.entity';

@Injectable()
export class PushNotificationRepository {
  constructor(
    @InjectRepository(DeviceToken)
    private readonly devices: Repository<DeviceToken>,
    @InjectRepository(NotificationPreference)
    private readonly preferences: Repository<NotificationPreference>,
    @InjectRepository(PushDelivery)
    private readonly deliveries: Repository<PushDelivery>,
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
  ) {}

  findDeviceByToken(token: string) {
    return this.devices
      .createQueryBuilder('device')
      .addSelect(['device.token', 'device.metadata'])
      .where('device.token = :token', { token })
      .getOne();
  }

  findDeviceForUser(userId: string, id: string) {
    return this.devices.findOne({ where: { id, userId } });
  }

  findDeviceWithToken(id: string) {
    return this.devices
      .createQueryBuilder('device')
      .addSelect('device.token')
      .where('device.id = :id', { id })
      .getOne();
  }

  listDevices(userId: string) {
    return this.devices.find({
      where: { userId },
      order: { lastSeenAt: 'DESC' },
    });
  }

  saveDevice(input: DeepPartial<DeviceToken>) {
    return this.devices.save(this.devices.create(input));
  }

  disableDevice(id: string) {
    return this.devices.update(id, { enabled: false });
  }

  findPreference(userId: string) {
    return this.preferences.findOne({ where: { userId } });
  }

  savePreference(input: DeepPartial<NotificationPreference>) {
    return this.preferences.save(this.preferences.create(input));
  }

  async ensureDefaultPreference(
    userId: string,
    topics: Record<string, boolean>,
  ) {
    await this.preferences
      .createQueryBuilder()
      .insert()
      .into(NotificationPreference)
      .values({
        userId,
        inAppEnabled: true,
        emailEnabled: true,
        pushEnabled: true,
        topics,
      })
      .orIgnore()
      .execute();
    return this.findPreference(userId);
  }

  findEnabledDevices(userId: string) {
    return this.devices.find({ where: { userId, enabled: true } });
  }

  async queueDeliveries(
    userId: string,
    notificationId: string,
    deviceIds: string[],
  ) {
    for (const deviceTokenId of deviceIds) {
      await this.deliveries
        .createQueryBuilder()
        .insert()
        .into(PushDelivery)
        .values({
          userId,
          notificationId,
          deviceTokenId,
          status: PushDeliveryStatus.PENDING,
          attempts: 0,
          nextAttemptAt: new Date(),
          providerReference: null,
          sentAt: null,
          failureReason: null,
          providerPayload: null,
          lockToken: null,
          lockedUntil: null,
        })
        .orIgnore()
        .execute();
    }
  }

  async claimDue(now: Date, limit = 50, lockSeconds = 120) {
    await this.deliveries
      .createQueryBuilder()
      .update(PushDelivery)
      .set({
        status: PushDeliveryStatus.PENDING,
        lockToken: null,
        lockedUntil: null,
      })
      .where('status = :processing', {
        processing: PushDeliveryStatus.PROCESSING,
      })
      .andWhere('lockedUntil < :now', { now })
      .execute();
    const candidates = await this.deliveries.find({
      where: {
        status: PushDeliveryStatus.PENDING,
        nextAttemptAt: LessThanOrEqual(now),
      },
      order: { nextAttemptAt: 'ASC' },
      take: limit * 3,
    });
    const claimed: PushDelivery[] = [];
    for (const candidate of candidates) {
      if (claimed.length >= limit) break;
      const lockToken = randomUUID();
      const lockedUntil = new Date(now.getTime() + lockSeconds * 1000);
      const result = await this.deliveries
        .createQueryBuilder()
        .update(PushDelivery)
        .set({
          status: PushDeliveryStatus.PROCESSING,
          lockToken,
          lockedUntil,
        })
        .where('id = :id', { id: candidate.id })
        .andWhere('status = :status', { status: PushDeliveryStatus.PENDING })
        .andWhere('nextAttemptAt <= :now', { now })
        .andWhere('(lockedUntil IS NULL OR lockedUntil < :now)', { now })
        .execute();
      if (!result.affected) continue;
      claimed.push({ ...candidate, status: PushDeliveryStatus.PROCESSING });
    }
    return claimed;
  }

  findNotification(id: string) {
    return this.notifications.findOne({ where: { id } });
  }

  updateDelivery(id: string, input: DeepPartial<PushDelivery>) {
    return this.deliveries.save(this.deliveries.create({ id, ...input }));
  }

  countPending(userId?: string) {
    return this.deliveries.count({
      where: userId
        ? { userId, status: PushDeliveryStatus.PENDING }
        : { status: PushDeliveryStatus.PENDING },
    });
  }
}
