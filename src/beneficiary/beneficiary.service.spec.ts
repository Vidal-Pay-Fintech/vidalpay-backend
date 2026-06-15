import { BeneficiaryService } from './beneficiary.service';

describe('BeneficiaryService', () => {
  let service: BeneficiaryService;

  beforeEach(() => {
    service = new BeneficiaryService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
