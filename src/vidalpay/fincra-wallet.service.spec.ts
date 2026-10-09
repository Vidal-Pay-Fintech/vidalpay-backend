import { ServiceUnavailableException } from '@nestjs/common';
import { FincraWalletService } from './fincra-wallet.service';

const service = (post: jest.Mock) =>
  new FincraWalletService({ fincraClient: () => ({ post }) } as any);

describe('FincraWalletService', () => {
  it('submits permanent virtual account requests to the documented sandbox endpoint', async () => {
    const post = jest.fn().mockResolvedValue({
      status: 200,
      data: { data: { id: 'request-1', status: 'pending' } },
    });

    await expect(
      service(post).requestPermanentVirtualAccount({
        currency: 'CAD',
        accountType: 'individual',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 200,
        providerReference: 'request-1',
        requestStatus: 'PENDING',
      }),
    );
    expect(post).toHaveBeenCalledWith('/profile/virtual-accounts/requests', {
      currency: 'CAD',
      accountType: 'individual',
    });
  });

  it('sanitizes provider timeouts and failures', async () => {
    const post = jest.fn().mockRejectedValue({ code: 'ECONNABORTED' });

    await expect(
      service(post).requestPermanentVirtualAccount({
        currency: 'CAD',
        accountType: 'individual',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
