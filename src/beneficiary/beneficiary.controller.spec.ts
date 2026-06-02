import { Test, TestingModule } from '@nestjs/testing';
import { BeneficiaryController } from './beneficiary.controller';
import { BeneficiaryService } from './beneficiary.service';

describe('BeneficiaryController', () => {
  let controller: BeneficiaryController;
  const beneficiaryService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BeneficiaryController],
      providers: [{ provide: BeneficiaryService, useValue: beneficiaryService }],
    }).compile();

    controller = module.get<BeneficiaryController>(BeneficiaryController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
