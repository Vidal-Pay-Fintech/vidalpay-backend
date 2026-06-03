import { JournalService } from './journal.service';

describe('JournalService', () => {
  let service: JournalService;

  beforeEach(() => {
    service = new JournalService({} as any, {} as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
