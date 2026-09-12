import { Test, TestingModule } from '@nestjs/testing';
import { WalletService } from './wallet.service';
import { WalletRepository } from 'src/database/repositories/wallet.repository';
import { Currency } from 'src/utils/enums/wallet.enum';

describe('WalletService', () => {
  let service: WalletService;
  const walletRepository = {
    find: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: WalletRepository, useValue: walletRepository },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
  });

  it('provisions separate zero-balance NGN and USD wallet rows for a new user', async () => {
    walletRepository.find.mockResolvedValue([]);

    await service.createCustomerWallets('user-1');

    expect(walletRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', currency: Currency.NGN, provider: 'PayVessel', balance: 0 }),
    );
    expect(walletRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', currency: Currency.USD, provider: 'Unit.co', balance: 0 }),
    );
  });

  it('does not recreate currencies that already exist', async () => {
    walletRepository.find.mockResolvedValue([{ currency: Currency.NGN }]);

    await service.createCustomerWallets('user-1');

    expect(walletRepository.create).toHaveBeenCalledTimes(1);
    expect(walletRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ currency: Currency.USD }),
    );
  });
});