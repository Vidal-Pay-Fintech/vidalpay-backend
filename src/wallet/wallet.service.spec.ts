import { WalletService } from './wallet.service';
import { Currency } from 'src/utils/enums/wallet.enum';

describe('WalletService', () => {
  let service: WalletService;

  beforeEach(() => {
    service = new WalletService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates both ledgers and marks the resolved currency as default', async () => {
    const wallets = [
      { id: 'ngn-wallet', userId: 'user-id', currency: Currency.NGN },
      { id: 'usd-wallet', userId: 'user-id', currency: Currency.USD },
    ];
    const walletRepository = {
      findUserWallets: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(wallets),
      createWalletInTransaction: jest.fn().mockResolvedValue(undefined),
      setDefaultWallet: jest.fn().mockResolvedValue(undefined),
    };
    const subject = new WalletService(
      walletRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      subject.createCustomerWallets('user-id', Currency.NGN, {} as any),
    ).resolves.toEqual(wallets);
    expect(walletRepository.createWalletInTransaction).toHaveBeenCalledTimes(2);
    expect(walletRepository.setDefaultWallet).toHaveBeenCalledWith(
      'user-id',
      Currency.NGN,
      expect.anything(),
    );
  });
});
