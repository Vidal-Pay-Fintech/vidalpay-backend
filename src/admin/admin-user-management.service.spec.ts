import { ForbiddenException } from '@nestjs/common';
import { KycStatus } from 'src/common/enum/kyc-status.enum';
import { AdminUserAction } from 'src/database/entities/admin-user-action.entity';
import { AccountStatus, User } from 'src/database/entities/user.entity';
import { UserKyc } from 'src/database/entities/user-kyc.entity';
import { RefreshSession } from 'src/database/entities/refresh-session.entity';
import { UserRole } from 'src/utils/enums/user.enum';
import { AdminUserManagementService } from './admin-user-management.service';

describe('AdminUserManagementService', () => {
  let service: AdminUserManagementService;
  let users: Map<string, any>;
  let kyc: any;
  let actions: any[];
  let sessionRepository: any;

  beforeEach(() => {
    users = new Map([
      [
        'admin-1',
        {
          id: 'admin-1',
          role: UserRole.ADMIN,
          status: AccountStatus.ACTIVE,
        },
      ],
      [
        'super-1',
        {
          id: 'super-1',
          role: UserRole.SUPER_ADMIN,
          status: AccountStatus.ACTIVE,
        },
      ],
      [
        'user-1',
        {
          id: 'user-1',
          email: 'user@example.com',
          role: UserRole.CUSTOMER,
          status: AccountStatus.ACTIVE,
          kycStatus: KycStatus.PENDING_REVIEW,
        },
      ],
    ]);
    kyc = {
      id: 'kyc-1',
      userId: 'user-1',
      status: KycStatus.PENDING_REVIEW,
      countryCode: 'US',
      identityData: { ssn: '123456789' },
      addressData: {
        addressLine1: '1 Main Street',
        city: 'New York',
        stateOrRegion: 'NY',
        country: 'United States',
        countryCode: 'US',
      },
      livenessData: { completed: true, outcome: 'PASS' },
      documents: [],
      providerResponse: null,
    };
    actions = [];
    const userRepository = {
      findOne: jest.fn(({ where }) =>
        Promise.resolve(users.get(where.id) ?? null),
      ),
      save: jest.fn((user) => {
        users.set(user.id, user);
        return Promise.resolve(user);
      }),
    };
    const kycRepository = {
      findOne: jest.fn().mockResolvedValue(kyc),
      save: jest.fn((value) => {
        kyc = value;
        return Promise.resolve(value);
      }),
    };
    const actionRepository = {
      create: jest.fn((value) => value),
      save: jest.fn((value) => {
        actions.push(value);
        return Promise.resolve(value);
      }),
    };
    sessionRepository = {
      update: jest.fn().mockResolvedValue({ affected: 2 }),
    };
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === User) return userRepository;
        if (entity === UserKyc) return kycRepository;
        if (entity === AdminUserAction) return actionRepository;
        if (entity === RefreshSession) return sessionRepository;
        throw new Error('Unexpected repository');
      }),
    };
    const dataSource = {
      transaction: jest.fn((callback) => callback(manager)),
    };
    service = new AdminUserManagementService(dataSource as any);
  });

  it('suspends an account, writes an audit event and revokes sessions', async () => {
    const result = await service.suspend(
      'user-1',
      'Confirmed account takeover investigation.',
      { actorId: 'admin-1' },
    );

    expect(result.status).toBe(AccountStatus.SUSPENDED);
    expect(actions[0]).toMatchObject({
      action: 'SUSPEND',
      targetUserId: 'user-1',
      previousState: { status: AccountStatus.ACTIVE },
    });
    expect(sessionRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      expect.objectContaining({ revokedAt: expect.any(Date) }),
    );
  });

  it('prevents a normal administrator from managing a super administrator', async () => {
    await expect(
      service.suspend(
        'super-1',
        'Security investigation requires suspension.',
        {
          actorId: 'admin-1',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows only a super administrator to change roles', async () => {
    await expect(
      service.changeRole(
        'user-1',
        { role: UserRole.ADVISOR, reason: 'Approved staffing role change.' },
        { actorId: 'admin-1' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const result = await service.changeRole(
      'user-1',
      { role: UserRole.ADVISOR, reason: 'Approved staffing role change.' },
      { actorId: 'super-1' },
    );
    expect(result.role).toBe(UserRole.ADVISOR);
    expect(sessionRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      expect.objectContaining({ revokedAt: expect.any(Date) }),
    );
  });

  it('atomically approves complete KYC and masks identity output', async () => {
    const result = await service.reviewKyc(
      'user-1',
      {
        status: KycStatus.VERIFIED,
        reason: 'All submitted evidence is valid.',
      },
      { actorId: 'admin-1' },
    );

    expect(result.user.kycStatus).toBe(KycStatus.VERIFIED);
    expect(result.kyc!.identity!.ssn).toBe('***6789');
    expect(JSON.stringify(result)).not.toContain('123456789');
    expect(actions[0].action).toBe('KYC_APPROVE');
  });
});
