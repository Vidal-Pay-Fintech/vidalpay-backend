import { BadRequestException } from '@nestjs/common';
import { PushNotificationService } from './push-notification.service';
import {
  NotificationTopic,
  PushDeliveryStatus,
  PushPlatform,
} from './push-notification.enums';
import { PushProviderError } from './push-provider.gateway';

describe('PushNotificationService', () => {
  let service: PushNotificationService;
  let repository: any;
  let gateway: any;

  const preference = {
    id: 'preference-1',
    userId: 'user-1',
    inAppEnabled: true,
    emailEnabled: true,
    pushEnabled: true,
    topics: {
      SECURITY: true,
      TRANSACTIONS: true,
      PRODUCT: true,
      MARKETING: false,
    },
  };

  beforeEach(() => {
    repository = {
      findDeviceByToken: jest.fn(),
      saveDevice: jest.fn((value) => ({ id: 'device-1', ...value })),
      listDevices: jest.fn().mockResolvedValue([]),
      findPreference: jest.fn().mockResolvedValue(preference),
      ensureDefaultPreference: jest.fn().mockResolvedValue(preference),
      savePreference: jest.fn((value) => ({ ...preference, ...value })),
      findEnabledDevices: jest.fn().mockResolvedValue([{ id: 'device-1' }]),
      queueDeliveries: jest.fn().mockResolvedValue(undefined),
      countPending: jest.fn().mockResolvedValue(3),
      claimDue: jest.fn().mockResolvedValue([]),
      findNotification: jest.fn(),
      findDeviceWithToken: jest.fn(),
      updateDelivery: jest.fn((id, value) => ({ id, ...value })),
      disableDevice: jest.fn(),
    };
    gateway = {
      isConfigured: jest.fn().mockReturnValue(true),
      send: jest.fn().mockResolvedValue({
        providerReference: 'onesignal-message-1',
        payload: { id: 'onesignal-message-1', recipients: 1 },
      }),
    };
    service = new PushNotificationService(repository, gateway, {
      get: jest.fn(),
    } as any);
  });

  it('registers a OneSignal subscription without returning its token', async () => {
    const result = await service.registerDevice('user-1', {
      subscriptionId: 'subscription-secret-id',
      platform: PushPlatform.IOS,
      deviceId: 'iphone-1',
    });

    expect(repository.saveDevice).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'subscription-secret-id' }),
    );
    expect(result).not.toHaveProperty('token');
  });

  it('queues transaction notifications for enabled devices', async () => {
    const count = await service.queueForNotification({
      id: 'notification-1',
      userId: 'user-1',
      type: 'INTERNAL_TRANSFER_SENT',
    } as any);

    expect(count).toBe(1);
    expect(repository.queueDeliveries).toHaveBeenCalledWith(
      'user-1',
      'notification-1',
      ['device-1'],
    );
  });

  it('honors topic opt-out for marketing pushes', async () => {
    const count = await service.queueForNotification({
      id: 'notification-1',
      userId: 'user-1',
      type: 'MARKETING_PROMO',
    } as any);

    expect(count).toBe(0);
    expect(repository.queueDeliveries).not.toHaveBeenCalled();
  });

  it('leaves queued deliveries untouched while OneSignal is unavailable', async () => {
    gateway.isConfigured.mockReturnValue(false);

    const result = await service.processDue();

    expect(result).toMatchObject({ ready: false, queued: 3 });
    expect(repository.claimDue).not.toHaveBeenCalled();
  });

  it('delivers with the database delivery id as provider idempotency key', async () => {
    repository.claimDue.mockResolvedValue([
      {
        id: 'delivery-1',
        notificationId: 'notification-1',
        deviceTokenId: 'device-1',
        attempts: 0,
      },
    ]);
    const notification = {
      id: 'notification-1',
      title: 'Transfer received',
      body: 'You received money.',
      type: 'TRANSFER_RECEIVED',
      metadata: null,
    };
    repository.findNotification.mockResolvedValue(notification);
    repository.findDeviceWithToken.mockResolvedValue({
      id: 'device-1',
      token: 'subscription-id',
      enabled: true,
    });

    await service.processDue();

    expect(gateway.send).toHaveBeenCalledWith(
      'subscription-id',
      notification,
      'delivery-1',
    );
    expect(repository.updateDelivery).toHaveBeenCalledWith(
      'delivery-1',
      expect.objectContaining({ status: PushDeliveryStatus.SENT }),
    );
  });

  it('disables a permanently invalid subscription', async () => {
    repository.claimDue.mockResolvedValue([
      {
        id: 'delivery-1',
        notificationId: 'notification-1',
        deviceTokenId: 'device-1',
        attempts: 0,
      },
    ]);
    repository.findNotification.mockResolvedValue({ id: 'notification-1' });
    repository.findDeviceWithToken.mockResolvedValue({
      id: 'device-1',
      token: 'invalid-subscription',
      enabled: true,
    });
    gateway.send.mockRejectedValue(
      new PushProviderError('Invalid subscription.', true),
    );

    await service.processDue();

    expect(repository.disableDevice).toHaveBeenCalledWith('device-1');
    expect(repository.updateDelivery).toHaveBeenCalledWith(
      'delivery-1',
      expect.objectContaining({ status: PushDeliveryStatus.FAILED }),
    );
  });

  it('rejects unknown preference topics', async () => {
    await expect(
      service.updatePreferences('user-1', {
        topics: { [NotificationTopic.SECURITY]: true, UNKNOWN: true },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
