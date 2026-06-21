import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Notification } from 'src/database/entities/notification.entity';
import { PushNotificationRepository } from 'src/database/repositories/push-notification.repository';
import {
  RegisterPushDeviceDto,
  UpdateNotificationPreferencesDto,
} from './dto/push-notification.dto';
import {
  NotificationTopic,
  PushDeliveryStatus,
} from './push-notification.enums';
import {
  PushProviderError,
  PushProviderGateway,
} from './push-provider.gateway';

const DEFAULT_TOPICS: Record<NotificationTopic, boolean> = {
  [NotificationTopic.SECURITY]: true,
  [NotificationTopic.TRANSACTIONS]: true,
  [NotificationTopic.PRODUCT]: true,
  [NotificationTopic.MARKETING]: false,
};
const MAX_ATTEMPTS = 5;

@Injectable()
export class PushNotificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushNotificationService.name);
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(
    private readonly repository: PushNotificationRepository,
    private readonly gateway: PushProviderGateway,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (this.config.get('PUSH_NOTIFICATION_WORKER_ENABLED') !== 'true') return;
    const interval = Math.max(
      15_000,
      Number(this.config.get('PUSH_NOTIFICATION_WORKER_INTERVAL_MS') ?? 30_000),
    );
    this.timer = setInterval(() => void this.runWorker(), interval);
    this.timer.unref();
    void this.runWorker();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async registerDevice(userId: string, dto: RegisterPushDeviceDto) {
    const existing = await this.repository.findDeviceByToken(
      dto.subscriptionId.trim(),
    );
    const saved = await this.repository.saveDevice({
      id: existing?.id,
      userId,
      token: dto.subscriptionId.trim(),
      platform: dto.platform,
      deviceId: dto.deviceId?.trim() ?? null,
      appVersion: dto.appVersion?.trim() ?? null,
      enabled: true,
      lastSeenAt: new Date(),
      metadata: this.safeMetadata(dto.metadata),
    });
    return this.safeDevice(saved);
  }

  async listDevices(userId: string) {
    const devices = await this.repository.listDevices(userId);
    return devices.map((device) => this.safeDevice(device));
  }

  async revokeDevice(userId: string, deviceId: string) {
    const device = await this.repository.findDeviceForUser(userId, deviceId);
    if (!device) throw new NotFoundException('Push device not found.');
    await this.repository.disableDevice(device.id);
    return { message: 'Push device revoked successfully.', id: device.id };
  }

  async getPreferences(userId: string) {
    const preference = await this.getOrCreatePreference(userId);
    return this.safePreference(preference);
  }

  async updatePreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ) {
    const preference = await this.getOrCreatePreference(userId);
    const topics = dto.topics
      ? this.validateTopics({
          ...DEFAULT_TOPICS,
          ...(preference.topics ?? {}),
          ...dto.topics,
        })
      : (preference.topics ?? DEFAULT_TOPICS);
    const saved = await this.repository.savePreference({
      id: preference.id,
      userId,
      inAppEnabled: dto.inAppEnabled ?? preference.inAppEnabled,
      emailEnabled: dto.emailEnabled ?? preference.emailEnabled,
      pushEnabled: dto.pushEnabled ?? preference.pushEnabled,
      topics,
    });
    return this.safePreference(saved);
  }

  async queueForNotification(notification: Notification) {
    const preference = await this.getOrCreatePreference(notification.userId);
    const topic = this.topicForType(notification.type);
    const topics = { ...DEFAULT_TOPICS, ...(preference.topics ?? {}) };
    if (!preference.pushEnabled || topics[topic] === false) return 0;
    const devices = await this.repository.findEnabledDevices(
      notification.userId,
    );
    if (!devices.length) return 0;
    await this.repository.queueDeliveries(
      notification.userId,
      notification.id,
      devices.map((device) => device.id),
    );
    return devices.length;
  }

  async processDue() {
    if (!this.gateway.isConfigured()) {
      return {
        ready: false,
        queued: await this.repository.countPending(),
        message: 'OneSignal push delivery is not configured.',
      };
    }
    const deliveries = await this.repository.claimDue(new Date());
    const results: unknown[] = [];
    for (const delivery of deliveries) {
      results.push(await this.processDelivery(delivery));
    }
    return { ready: true, claimed: deliveries.length, results };
  }

  private async processDelivery(delivery: any) {
    const [notification, device] = await Promise.all([
      this.repository.findNotification(delivery.notificationId),
      this.repository.findDeviceWithToken(delivery.deviceTokenId),
    ]);
    if (!notification || !device || !device.enabled || !device.token) {
      return this.repository.updateDelivery(delivery.id, {
        status: PushDeliveryStatus.SKIPPED,
        failureReason: 'Notification or active push device is unavailable.',
        lockToken: null,
        lockedUntil: null,
      });
    }
    const attempts = delivery.attempts + 1;
    try {
      const result = await this.gateway.send(
        device.token,
        notification,
        delivery.id,
      );
      return this.repository.updateDelivery(delivery.id, {
        status: PushDeliveryStatus.SENT,
        attempts,
        providerReference: result.providerReference,
        providerPayload: result.payload,
        sentAt: new Date(),
        failureReason: null,
        lockToken: null,
        lockedUntil: null,
      });
    } catch (error) {
      const permanent = error instanceof PushProviderError && error.permanent;
      if (permanent) await this.repository.disableDevice(device.id);
      const retry = !permanent && attempts < MAX_ATTEMPTS;
      return this.repository.updateDelivery(delivery.id, {
        status: retry ? PushDeliveryStatus.PENDING : PushDeliveryStatus.FAILED,
        attempts,
        nextAttemptAt: retry ? this.retryAt(attempts) : delivery.nextAttemptAt,
        failureReason: this.safeMessage(error),
        providerPayload:
          error instanceof PushProviderError ? error.payload : null,
        lockToken: null,
        lockedUntil: null,
      });
    }
  }

  private async runWorker() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.processDue();
    } catch (error) {
      this.logger.error(`Push worker failed: ${this.safeMessage(error)}`);
    } finally {
      this.busy = false;
    }
  }

  private async getOrCreatePreference(userId: string) {
    const existing = await this.repository.findPreference(userId);
    if (existing) return existing;
    const created = await this.repository.ensureDefaultPreference(
      userId,
      DEFAULT_TOPICS,
    );
    if (!created) {
      throw new Error('Unable to initialize notification preferences.');
    }
    return created;
  }

  private validateTopics(topics: Record<string, boolean>) {
    const allowed = new Set(Object.values(NotificationTopic));
    for (const [topic, enabled] of Object.entries(topics)) {
      if (
        !allowed.has(topic as NotificationTopic) ||
        typeof enabled !== 'boolean'
      ) {
        throw new BadRequestException(
          `Unsupported notification topic: ${topic}`,
        );
      }
    }
    return topics;
  }

  private topicForType(type: string) {
    const value = type.toUpperCase();
    if (/AUTH|SECURITY|PASSWORD|PIN|SESSION|LOGIN/.test(value))
      return NotificationTopic.SECURITY;
    if (/TRANSFER|PAYMENT|WALLET|CARD|LOAN|CRYPTO|INVEST|REFUND/.test(value)) {
      return NotificationTopic.TRANSACTIONS;
    }
    if (/PROMO|MARKETING|REWARD|OFFER/.test(value))
      return NotificationTopic.MARKETING;
    return NotificationTopic.PRODUCT;
  }

  private safeDevice(device: any) {
    return {
      id: device.id,
      platform: device.platform,
      deviceId: device.deviceId,
      appVersion: device.appVersion,
      enabled: device.enabled,
      lastSeenAt: device.lastSeenAt,
      createdAt: device.createdAt,
    };
  }

  private safePreference(preference: any) {
    return {
      inAppEnabled: preference.inAppEnabled,
      emailEnabled: preference.emailEnabled,
      pushEnabled: preference.pushEnabled,
      topics: { ...DEFAULT_TOPICS, ...(preference.topics ?? {}) },
    };
  }

  private safeMetadata(metadata?: Record<string, unknown>) {
    if (!metadata) return null;
    const safe: Record<string, string | number | boolean | null> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key)) continue;
      if (
        ['string', 'number', 'boolean'].includes(typeof value) ||
        value === null
      ) {
        safe[key] =
          typeof value === 'string' ? value.slice(0, 255) : (value as any);
      }
      if (Object.keys(safe).length >= 20) break;
    }
    return safe;
  }

  private retryAt(attempt: number) {
    const minutes = [1, 5, 15, 60, 180];
    return new Date(
      Date.now() + minutes[Math.min(attempt - 1, minutes.length - 1)] * 60_000,
    );
  }

  private safeMessage(error: unknown) {
    return error instanceof Error
      ? error.message.slice(0, 1000)
      : 'Push delivery failed.';
  }
}
