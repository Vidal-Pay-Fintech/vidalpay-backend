import { PushProviderGateway } from './push-provider.gateway';

describe('PushProviderGateway', () => {
  const originalEnvironment = { ...process.env };
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env = { ...originalEnvironment };
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('sends a targeted idempotent OneSignal notification', async () => {
    process.env.NOTIFICATION_PROVIDER_MODE = 'onesignal';
    process.env.ONESIGNAL_APP_ID = 'app-id';
    process.env.ONESIGNAL_REST_API_KEY = 'rest-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ id: 'message-id', recipients: 1 }),
    }) as any;
    const gateway = new PushProviderGateway();

    const result = await gateway.send(
      'subscription-id',
      {
        id: 'notification-id',
        title: 'Transfer received',
        body: 'You received NGN 100.',
        type: 'TRANSFER_RECEIVED',
        metadata: { reference: 'TX-1' },
      } as any,
      'delivery-id',
    );

    expect(result.providerReference).toBe('message-id');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.onesignal.com/notifications',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Key rest-key' }),
      }),
    );
    const request = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(JSON.parse(request.body)).toMatchObject({
      app_id: 'app-id',
      include_subscription_ids: ['subscription-id'],
      idempotency_key: 'delivery-id',
    });
  });
});
