import { TokensService } from './tokens.service';

describe('TokensService', () => {
  let service: TokensService;

  beforeEach(() => {
    service = new TokensService({} as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
