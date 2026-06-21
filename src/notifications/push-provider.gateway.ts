import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Notification } from 'src/database/entities/notification.entity';

export class PushProviderError extends Error {
  constructor(
    message: string,
    public readonly permanent = false,
    public readonly payload: Record<string, unknown> | null = null,
  ) {
    super(message);
  }
}

@Injectable()
export class PushProviderGateway {
  isConfigured() {
    return (
      process.env.NOTIFICATION_PROVIDER_MODE === 'onesignal' &&
      Boolean(process.env.ONESIGNAL_APP_ID?.trim()) &&
      Boolean(process.env.ONESIGNAL_REST_API_KEY?.trim())
    );
  }

  async send(
    subscriptionId: string,
    notification: Notification,
    idempotencyKey: string,
  ) {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'OneSignal push delivery is not configured.',
      );
    }
    const response = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Key ${process.env.ONESIGNAL_REST_API_KEY?.trim()}`,
      },
      body: JSON.stringify({
        app_id: process.env.ONESIGNAL_APP_ID?.trim(),
        include_subscription_ids: [subscriptionId],
        idempotency_key: idempotencyKey,
        headings: { en: notification.title },
        contents: { en: notification.body },
        data: this.safeData(notification),
      }),
    });
    const payload = await this.readBody(response);
    if (!response.ok) {
      throw new PushProviderError(
        `OneSignal push failed with status ${response.status}.`,
        [400, 404, 410].includes(response.status),
        payload,
      );
    }
    const reference = this.pickString(payload, 'id');
    const recipients = this.pickNumber(payload, 'recipients');
    if (!reference || recipients === 0) {
      throw new PushProviderError(
        'OneSignal did not accept the target subscription.',
        recipients === 0,
        payload,
      );
    }
    return { providerReference: reference, payload };
  }

  private safeData(notification: Notification) {
    const data: Record<string, string | number | boolean | null> = {
      notificationId: notification.id,
      type: notification.type,
    };
    for (const [key, value] of Object.entries(notification.metadata ?? {})) {
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key)) continue;
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        value === null
      ) {
        data[key] = typeof value === 'string' ? value.slice(0, 255) : value;
      }
      if (Object.keys(data).length >= 20) break;
    }
    return data;
  }

  private async readBody(response: Response) {
    try {
      const value = (await response.json()) as unknown;
      return value && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  private pickString(payload: Record<string, unknown>, key: string) {
    const value = payload[key];
    return typeof value === 'string' && value.trim() ? value : null;
  }

  private pickNumber(payload: Record<string, unknown>, key: string) {
    const value = payload[key];
    return typeof value === 'number' ? value : null;
  }
}
