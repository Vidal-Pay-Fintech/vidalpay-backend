import { Test, TestingModule } from '@nestjs/testing';
import { AuthenticationController } from './authentication.controller';
import { AuthenticationService } from './authentication.service';
import { Request } from 'express';

describe('AuthenticationController', () => {
  let controller: AuthenticationController;
  const authService = { signUp: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthenticationController],
      providers: [{ provide: AuthenticationService, useValue: authService }],
    }).compile();

    controller = module.get<AuthenticationController>(AuthenticationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('only forwards an IP country header explicitly trusted by configuration', () => {
    const previousHeader = process.env.TRUSTED_IP_COUNTRY_HEADER;
    process.env.TRUSTED_IP_COUNTRY_HEADER = 'cf-ipcountry';

    controller.signUp(
      { phoneNumber: '+2348012345678' } as any,
      { headers: { 'cf-ipcountry': 'NG' } } as unknown as Request,
    );

    expect(authService.signUp).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ipCountryCode: 'NG' }),
    );
    if (previousHeader === undefined) {
      delete process.env.TRUSTED_IP_COUNTRY_HEADER;
    } else {
      process.env.TRUSTED_IP_COUNTRY_HEADER = previousHeader;
    }
  });
});
