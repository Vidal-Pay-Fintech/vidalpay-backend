import { Test, TestingModule } from '@nestjs/testing';
import { VaultController } from './vault.controller';
import { VaultService } from './vault.service';

describe('VaultController', () => {
  let controller: VaultController;
  const vaultService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VaultController],
      providers: [{ provide: VaultService, useValue: vaultService }],
    }).compile();

    controller = module.get<VaultController>(VaultController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
