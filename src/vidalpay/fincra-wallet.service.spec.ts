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

  it('loads the Nigerian payout bank catalog from Fincra', async () => {
    const get = jest.fn().mockResolvedValue({
      data: { success: true, data: [{ code: '044', name: 'Access Bank' }] },
    });
    const client = new FincraWalletService({
      fincraClient: () => ({ get }),
    } as any);

    await expect(client.listBanks('NG', 'NGN')).resolves.toEqual({
      success: true,
      data: [{ code: '044', name: 'Access Bank' }],
    });
    expect(get).toHaveBeenCalledWith('/core/banks', {
      params: { country: 'NG', currency: 'NGN', paymentDestination: 'bank_account' },
    });
  });

  it('verifies a conversion by its provider reference before settlement', async () => {
    const get = jest.fn().mockResolvedValue({
      data: { success: true, data: { reference: 'conversion/ref', status: 'successful' } },
    });
    const client = new FincraWalletService({
      fincraClient: () => ({ get }),
    } as any);

    await expect(client.verifyConversionStatus('conversion/ref')).resolves.toEqual({
      success: true,
      data: { reference: 'conversion/ref', status: 'successful' },
    });
    expect(get).toHaveBeenCalledWith('/conversions/reference/conversion%2Fref');
  });
});
