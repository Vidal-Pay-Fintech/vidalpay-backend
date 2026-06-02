import { VaultService } from './vault.service';

describe('VaultService', () => {
  let service: VaultService;

  beforeEach(() => {
    service = new VaultService({} as any, {} as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
