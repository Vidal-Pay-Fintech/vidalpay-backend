import { AuthenticationService } from './authentication.service';

describe('AuthenticationService', () => {
  let service: AuthenticationService;

  beforeEach(() => {
    service = new AuthenticationService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        secret: 'test-secret',
        audience: 'test-audience',
        issuer: 'test-issuer',
        accessTokenTtl: 3600,
        refreshAccessTokenTtl: 86400,
      },
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
