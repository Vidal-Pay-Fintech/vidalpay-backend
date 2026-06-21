import { Test, TestingModule } from '@nestjs/testing';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { FeatureFlagService } from 'src/feature-flags/feature-flag.service';

describe('WalletController', () => {
  let controller: WalletController;
  const walletService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletController],
      providers: [
        { provide: WalletService, useValue: walletService },
        {
          provide: FeatureFlagService,
          useValue: { assertDemoEnabled: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<WalletController>(WalletController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
