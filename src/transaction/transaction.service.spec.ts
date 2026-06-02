import { TransactionService } from './transaction.service';

describe('TransactionService', () => {
  let service: TransactionService;

  beforeEach(() => {
    service = new TransactionService({} as any, {} as any, {} as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
