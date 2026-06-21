import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  it('persists in-app notification before queueing push delivery', async () => {
    const stored = {
      id: 'notification-1',
      userId: 'user-1',
      type: 'SECURITY_ALERT',
      title: 'New login',
      body: 'A new login was detected.',
    };
    const repository = {
      create: jest.fn().mockResolvedValue(stored),
    };
    const push = {
      queueForNotification: jest.fn().mockResolvedValue(1),
    };
    const service = new NotificationService(repository as any, push as any);

    const result = await service.create({
      userId: 'user-1',
      type: 'SECURITY_ALERT',
      title: 'New login',
      body: 'A new login was detected.',
    });

    expect(result).toBe(stored);
    expect(push.queueForNotification).toHaveBeenCalledWith(stored);
  });

  it('does not fail the business action if push queueing fails', async () => {
    const stored = { id: 'notification-1' };
    const service = new NotificationService(
      { create: jest.fn().mockResolvedValue(stored) } as any,
      {
        queueForNotification: jest
          .fn()
          .mockRejectedValue(new Error('queue unavailable')),
      } as any,
    );

    await expect(
      service.create({
        userId: 'user-1',
        type: 'PRODUCT_UPDATE',
        title: 'Update',
        body: 'A product update is available.',
      }),
    ).resolves.toBe(stored);
  });
});
