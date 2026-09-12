import { Test, TestingModule } from '@nestjs/testing';
import { AuthenticationController } from './authentication.controller';
import { AuthenticationService } from './authentication.service';

describe('AuthenticationController', () => {
  let controller: AuthenticationController;
  const authService = {
    signUp: jest.fn(),
    signIn: jest.fn(),
    refreshToken: jest.fn(),
    validateTransactionPin: jest.fn(),
    getAuthenticatedUser: jest.fn(),
    reauth: jest.fn(),
    getSessions: jest.fn(),
    revokeSession: jest.fn(),
    revokeOtherSessions: jest.fn(),
    logout: jest.fn(),
    logoutAll: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthenticationController],
      providers: [{ provide: AuthenticationService, useValue: authService }],
    }).compile();

    controller = module.get<AuthenticationController>(AuthenticationController);
  });

  it('passes signup payloads and request metadata to the service', async () => {
    authService.signUp.mockResolvedValue({ accessToken: 'token' });
    const request = { headers: {} } as any;
    const payload = { email: 'a@example.com', password: 'Passw0rd!' } as any;

    await expect(controller.signUp(payload, request)).resolves.toEqual({ accessToken: 'token' });
    expect(authService.signUp).toHaveBeenCalledWith(payload, request);
  });

  it('sets a session cookie on login while returning backend tokens', async () => {
    authService.signIn.mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' });
    const response = { cookie: jest.fn() } as any;

    await expect(controller.signIn(response, { email: 'a@example.com', password: 'secret' } as any, {} as any)).resolves.toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
    });
    expect(response.cookie).toHaveBeenCalledWith('token', 'access', expect.objectContaining({ httpOnly: true }));
  });

  it('returns a usable transaction PIN validation response', async () => {
    await expect(controller.validateTransactionPin('1234', { sub: 'user-1' } as any)).resolves.toEqual({ valid: true });
    expect(authService.validateTransactionPin).toHaveBeenCalledWith('user-1', '1234');
  });
});