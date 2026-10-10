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
    getAvailableWalletProducts: jest.fn(),
    getWalletEligibility: jest.fn(),
    activateWalletProduct: jest.fn(),
    getWalletTransactions: jest.fn(),
    getTransactions: jest.fn(),
    getAllTransactions: jest.fn(),
    getBankCatalog: jest.fn(),
    resolveExternalTransfer: jest.fn(),
    externalTransfer: jest.fn(),
    topUpCard: jest.fn(),
    getTopUpCardStatus: jest.fn(),
    getBillCatalog: jest.fn(),
    validateUtilityCustomer: jest.fn(),
    purchaseBill: jest.fn(),
    getCatalog: jest.fn(),
    purchaseService: jest.fn(),
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

  it('routes available wallet products through the backend catalogue service', async () => {
    vidalpayService.getAvailableWalletProducts.mockResolvedValue({
      products: [{ currency: 'GBP' }],
    });

    await expect(
      walletsController.available({ sub: 'user-1' } as any),
    ).resolves.toEqual({ products: [{ currency: 'GBP' }] });
    expect(vidalpayService.getAvailableWalletProducts).toHaveBeenCalledWith(
      'user-1',
    );
  });

  it('routes generic currency wallet reads, account details, and transactions', async () => {
    vidalpayService.getWalletByCurrency.mockResolvedValue({ currency: 'CAD' });
    vidalpayService.getWalletAccountDetails.mockResolvedValue({ accountDetails: { currency: 'CAD' } });
    vidalpayService.getTransactions.mockResolvedValue({ transactions: [] });

    await expect(
      walletsController.walletByCurrency({ sub: 'user-1' } as any, 'cad'),
    ).resolves.toEqual({ currency: 'CAD' });
    await expect(
      walletsController.accountDetailsByCurrency({ sub: 'user-1' } as any, 'cad'),
    ).resolves.toEqual({ accountDetails: { currency: 'CAD' } });
    await expect(
      walletsController.transactionsByCurrency({ sub: 'user-1' } as any, 'cad'),
    ).resolves.toEqual({ transactions: [] });

    expect(vidalpayService.getWalletByCurrency).toHaveBeenCalledWith('user-1', 'cad');
    expect(vidalpayService.getWalletAccountDetails).toHaveBeenCalledWith('user-1', 'cad');
    expect(vidalpayService.getTransactions).toHaveBeenCalledWith('user-1', 'cad');
  });

  it('routes wallet eligibility and activation by requested currency', async () => {
    vidalpayService.getWalletEligibility.mockResolvedValue({
      currency: 'GBP',
      status: 'REQUIRES_INFORMATION',
    });
    vidalpayService.activateWalletProduct.mockResolvedValue({
      currency: 'GBP',
      activation: { status: 'PROVIDER_NOT_CONFIGURED' },
    });

    await expect(
      walletsController.eligibility({ sub: 'user-1' } as any, 'gbp'),
    ).resolves.toEqual({
      currency: 'GBP',
      status: 'REQUIRES_INFORMATION',
    });
    await expect(
      walletsController.activate({ sub: 'user-1' } as any, 'gbp', {
        idempotencyKey: 'idem-1',
      }),
    ).resolves.toEqual({
      currency: 'GBP',
      activation: { status: 'PROVIDER_NOT_CONFIGURED' },
    });
    expect(vidalpayService.getWalletEligibility).toHaveBeenCalledWith(
      'user-1',
      'gbp',
    );
    expect(vidalpayService.activateWalletProduct).toHaveBeenCalledWith(
      'user-1',
      'gbp',
      { idempotencyKey: 'idem-1' },
    );
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

  it('routes VTU.ng service catalogs and purchases through VidalpayService', async () => {
    vidalpayService.getCatalog.mockResolvedValue({ provider: 'VTU.ng' });
    vidalpayService.purchaseService.mockResolvedValue({ provider: 'VTU.ng' });

    await walletController.tvCatalog({ sub: 'user-1' } as any);
    await walletController.bettingCatalog({ sub: 'user-1' } as any);
    await walletController.epinsCatalog({ sub: 'user-1' } as any);
    await walletController.verifyServiceCustomer({ sub: 'user-1' } as any, {
      serviceId: 'dstv',
      customerId: '12345',
    });
    await walletController.electricity({ sub: 'user-1' } as any, {
      idempotencyKey: 'electricity-1',
    });
    await walletController.tv({ sub: 'user-1' } as any, {
      idempotencyKey: 'tv-1',
    });
    await walletController.betting({ sub: 'user-1' } as any, {
      idempotencyKey: 'betting-1',
    });
    await walletController.epins({ sub: 'user-1' } as any, {
      idempotencyKey: 'epin-1',
    });

    expect(vidalpayService.getCatalog).toHaveBeenCalledWith('user-1', 'tv');
    expect(vidalpayService.getCatalog).toHaveBeenCalledWith('user-1', 'betting');
    expect(vidalpayService.getCatalog).toHaveBeenCalledWith('user-1', 'epins');
    expect(vidalpayService.validateUtilityCustomer).toHaveBeenCalledWith(
      'user-1',
      { serviceId: 'dstv', customerId: '12345' },
    );
    expect(vidalpayService.purchaseService).toHaveBeenCalledWith(
      'user-1',
      'electricity',
      { idempotencyKey: 'electricity-1' },
    );
    expect(vidalpayService.purchaseService).toHaveBeenCalledWith('user-1', 'tv', {
      idempotencyKey: 'tv-1',
    });
    expect(vidalpayService.purchaseService).toHaveBeenCalledWith(
      'user-1',
      'betting',
      { idempotencyKey: 'betting-1' },
    );
    expect(vidalpayService.purchaseService).toHaveBeenCalledWith(
      'user-1',
      'epins',
      { idempotencyKey: 'epin-1' },
    );
  });

});
