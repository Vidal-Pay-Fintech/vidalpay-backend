import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller';
import { VidalpayService } from 'src/vidalpay/vidalpay.service';

describe('UserController', () => {
  let controller: UserController;
  const vidalpayService = {
    getCurrentUser: jest.fn(),
    getHome: jest.fn(),
    updateProfile: jest.fn(),
    requestEmailChange: jest.fn(),
    submitKycIdentity: jest.fn(),
    closeAccount: jest.fn(),
    requestAccountDeletion: jest.fn(),
    listScheduledTransfers: jest.fn(),
    createScheduledTransfer: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [{ provide: VidalpayService, useValue: vidalpayService }],
    }).compile();

    controller = module.get<UserController>(UserController);
  });

  it('serves /user/me from the backend user source of truth', async () => {
    vidalpayService.getCurrentUser.mockResolvedValue({ id: 'user-1' });

    await expect(controller.me({ sub: 'user-1' } as any)).resolves.toEqual({ id: 'user-1' });
    expect(vidalpayService.getCurrentUser).toHaveBeenCalledWith('user-1');
  });

  it('forwards profile updates to the service', async () => {
    vidalpayService.updateProfile.mockResolvedValue({ id: 'user-1', firstName: 'Ada' });

    await expect(controller.updateProfile({ sub: 'user-1' } as any, { firstName: 'Ada' })).resolves.toEqual({ id: 'user-1', firstName: 'Ada' });
  });

  it('routes account closure and deletion requests through the backend service', async () => {
    vidalpayService.closeAccount.mockResolvedValue({ closed: true });
    vidalpayService.requestAccountDeletion.mockRejectedValue(new Error('blocked'));

    await expect(
      controller.closeAccount({ sub: 'user-1' } as any, { password: 'secret' }),
    ).resolves.toEqual({ closed: true });
    await expect(
      controller.requestAccountDeletion({ sub: 'user-1' } as any, { reason: 'privacy' }),
    ).rejects.toThrow('blocked');
    expect(vidalpayService.closeAccount).toHaveBeenCalledWith('user-1', { password: 'secret' });
    expect(vidalpayService.requestAccountDeletion).toHaveBeenCalledWith('user-1', { reason: 'privacy' });
  });

  it('routes scheduled transfer list and create requests through the service', async () => {
    vidalpayService.listScheduledTransfers.mockResolvedValue({ enabled: false, scheduledTransfers: [] });
    vidalpayService.createScheduledTransfer.mockRejectedValue(new Error('blocked'));

    await expect(controller.scheduledTransfers({ sub: 'user-1' } as any)).resolves.toEqual({
      enabled: false,
      scheduledTransfers: [],
    });
    await expect(
      controller.createScheduledTransfer({ sub: 'user-1' } as any, { amount: 25 }),
    ).rejects.toThrow('blocked');
    expect(vidalpayService.createScheduledTransfer).toHaveBeenCalledWith('user-1', { amount: 25 });
  });
});
