import { Test, TestingModule } from '@nestjs/testing';
import { WalletController, WalletsController } from './wallet.controller';
import { VidalpayService } from 'src/vidalpay/vidalpay.service';
import { Currency } from 'src/utils/enums/wallet.enum';

describe('Wallet controllers', () => {
  let walletController: WalletController;
  let walletsController: WalletsController;
  const vidalpayService = {
    getWallets: jest.fn(),
    getWallet: jest.fn(),
    getWalletByCurrency: jest.fn(),
    getWalletAccountDetails: jest.fn(),
    getWalletTransactions: jest.fn(),
    getAllTransactions: jest.fn(),
    getBankCatalog: jest.fn(),
    resolveExternalTransfer: jest.fn(),
    externalTransfer: jest.fn(),
    topUpCard: jest.fn(),
    getTopUpCardStatus: jest.fn(),
    getBillCatalog: jest.fn(),
    validateUtilityCustomer: jest.fn(),
    purchaseBill: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletController, WalletsController],
      providers: [{ provide: VidalpayService, useValue: vidalpayService }],
    }).compile();

    walletController = module.get<WalletController>(WalletController);
    walletsController = module.get<WalletsController>(WalletsController);
  });

  it('keeps /wallets/usd isolated to USD data', async () => {
    vidalpayService.getWalletByCurrency.mockResolvedValue({ currency: Currency.USD });

    await expect(walletsController.usd({ sub: 'user-1' } as any)).resolves.toEqual({ currency: Currency.USD });
    expect(vidalpayService.getWalletByCurrency).toHaveBeenCalledWith('user-1', Currency.USD);
  });

  it('keeps /wallets/ngn isolated to NGN data', async () => {
    vidalpayService.getWalletByCurrency.mockResolvedValue({ currency: Currency.NGN });

    await expect(walletsController.ngn({ sub: 'user-1' } as any)).resolves.toEqual({ currency: Currency.NGN });
    expect(vidalpayService.getWalletByCurrency).toHaveBeenCalledWith('user-1', Currency.NGN);
  });

  it('routes external transfer resolution through the provider-aware service', async () => {
    vidalpayService.resolveExternalTransfer.mockResolvedValue({ accountName: 'Receiver' });

    await walletController.resolveExternalTransfer(
      { sub: 'user-1' } as any,
      { bankCode: '001', accountNumber: '1234567890' },
    );
    expect(vidalpayService.resolveExternalTransfer).toHaveBeenCalledWith(
      'user-1',
      { bankCode: '001', accountNumber: '1234567890' },
    );
  });
});
