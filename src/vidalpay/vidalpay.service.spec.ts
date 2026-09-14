import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash } from 'bcrypt';
import { DataSource } from 'typeorm';
import { AccountStatus } from 'src/database/entities/user.entity';
import { VidalpayService } from './vidalpay.service';
import { ProviderStatusService } from './provider-status.service';
import { Currency } from 'src/utils/enums/wallet.enum';

const repo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn((payload) => payload),
  save: jest.fn(async (payload) => payload),
  update: jest.fn(),
  delete: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const status = (overrides: Record<string, unknown> = {}) => ({
  provider: 'Unit.co',
  providerType: 'BANKING',
  capability: 'usd_account_details',
  enabled: false,
  envConfigured: false,
  liveTested: false,
  status: 'UNAVAILABLE',
  readinessStatus: 'MISSING_CREDENTIALS',
  missingEnvVars: ['UNIT_API_TOKEN'],
  failureReason: 'Missing backend environment variables: UNIT_API_TOKEN',
  service: 'Unit sandbox deposit account routing details',
  capabilities: ['usd_account_details'],
  mode: 'test',
  ...overrides,
});

describe('VidalpayService', () => {
  let service: VidalpayService;
  let userRepository: ReturnType<typeof repo>;
  let walletRepository: ReturnType<typeof repo>;
  let kycProfileRepository: ReturnType<typeof repo>;
  let providerOperationRepository: ReturnType<typeof repo>;
  let rewardLedgerRepository: ReturnType<typeof repo>;
  let referralEventRepository: ReturnType<typeof repo>;
  let notificationRepository: ReturnType<typeof repo>;
  let notificationPreferenceRepository: ReturnType<typeof repo>;
  let notificationDeviceRepository: ReturnType<typeof repo>;
  let providerStatusService: jest.Mocked<
    Pick<
      ProviderStatusService,
      'getStatus' | 'getStatuses' | 'isCapabilityEnabled'
    >
  >;

  beforeEach(() => {
    userRepository = repo();
    walletRepository = repo();
    kycProfileRepository = repo();
    const transactionRepository = repo();
    providerOperationRepository = repo();
    rewardLedgerRepository = repo();
    referralEventRepository = repo();
    const cardRepository = repo();
    const beneficiaryRepository = repo();
    notificationRepository = repo();
    notificationPreferenceRepository = repo();
    notificationDeviceRepository = repo();
    const supportTicketRepository = repo();
    const tokenRepository = repo();
    const disputeRepository = repo();
    providerStatusService = {
      getStatus: jest.fn((capability: any) =>
        status({
          capability,
          provider: capability?.startsWith?.('ngn') ? 'PayVessel' : 'Unit.co',
          missingEnvVars: capability?.startsWith?.('ngn')
            ? ['PAYVESSEL_API_KEY', 'PAYVESSEL_API_SECRET']
            : ['UNIT_API_TOKEN'],
        }),
      ),
      getStatuses: jest.fn().mockReturnValue([status()]),
      isCapabilityEnabled: jest.fn().mockReturnValue(false),
    };

    service = new VidalpayService(
      userRepository as any,
      walletRepository as any,
      kycProfileRepository as any,
      transactionRepository as any,
      providerOperationRepository as any,
      rewardLedgerRepository as any,
      referralEventRepository as any,
      cardRepository as any,
      beneficiaryRepository as any,
      notificationRepository as any,
      notificationPreferenceRepository as any,
      notificationDeviceRepository as any,
      supportTicketRepository as any,
      tokenRepository as any,
      disputeRepository as any,
      providerStatusService as any,
      { get: jest.fn() } as unknown as ConfigService,
      {} as any,
      {} as DataSource,
    );
  });

  it('keeps USD wallet responses isolated from NGN account data', async () => {
    userRepository.findOne.mockResolvedValue({ id: 'user-1' });
    walletRepository.find.mockResolvedValue([
      {
        id: 'ngn-wallet',
        userId: 'user-1',
        currency: Currency.NGN,
        accountNumber: '0123456789',
        balance: 10,
        provider: 'PayVessel',
      },
      {
        id: 'usd-wallet',
        userId: 'user-1',
        currency: Currency.USD,
        accountNumber: '000111222',
        balance: 20,
        provider: 'Unit.co',
      },
    ]);
    walletRepository.findOne.mockResolvedValue({
      id: 'usd-wallet',
      userId: 'user-1',
      currency: Currency.USD,
      accountNumber: '000111222',
      balance: 20,
      provider: 'Unit.co',
    });

    const wallet = await service.getWalletByCurrency('user-1', Currency.USD);

    expect(wallet.currency).toBe(Currency.USD);
    expect(wallet.accountNumber).toBe('000111222');
    expect(wallet.provider).toBe('Unit.co');
  });

  it.each([
    ['transactions', 'financial_transaction'],
    ['beneficiaries', 'beneficiary'],
    ['notifications', 'notification'],
  ])(
    'reports %s storage as unavailable instead of returning fake empty data',
    async (feature, tableName) => {
      const missingTable = Object.assign(
        new Error(`relation "${tableName}" does not exist`),
        { code: '42P01' },
      );

      if (feature === 'transactions') {
        const transactionRepository = (service as any).transactionRepository;
        transactionRepository.find.mockRejectedValue(missingTable);
        await expect(service.getTransactions('user-1')).rejects.toMatchObject({
          response: expect.objectContaining({
            code: 'FEATURE_STORAGE_UNAVAILABLE',
          }),
        });
      } else if (feature === 'beneficiaries') {
        const beneficiaryRepository = (service as any).beneficiaryRepository;
        beneficiaryRepository.find.mockRejectedValue(missingTable);
        await expect(service.getBeneficiaries('user-1')).rejects.toMatchObject({
          response: expect.objectContaining({
            code: 'FEATURE_STORAGE_UNAVAILABLE',
          }),
        });
      } else {
        notificationRepository.find.mockRejectedValue(missingTable);
        await expect(service.listNotifications('user-1')).rejects.toMatchObject(
          {
            response: expect.objectContaining({
              code: 'FEATURE_STORAGE_UNAVAILABLE',
            }),
          },
        );
      }
    },
  );

  it('creates only real local wallet records and marks provider account details unprovisioned', async () => {
    userRepository.findOne.mockResolvedValue({ id: 'user-1' });
    walletRepository.find.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 'ngn-wallet',
        userId: 'user-1',
        currency: Currency.NGN,
        balance: 0,
      },
      {
        id: 'usd-wallet',
        userId: 'user-1',
        currency: Currency.USD,
        balance: 0,
      },
    ]);

    const result = await service.getWallets('user-1');

    expect(walletRepository.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          currency: Currency.NGN,
          provider: 'PayVessel',
          balance: 0,
        }),
        expect.objectContaining({
          currency: Currency.USD,
          provider: 'Unit.co',
          balance: 0,
        }),
      ]),
    );
    expect(result.wallets.map((wallet) => wallet.currency)).toEqual([
      Currency.NGN,
      Currency.USD,
    ]);
  });

  it('restores an existing user session when the optional KYC table is absent', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'legacy-user',
      email: 'legacy@example.com',
      isVerified: true,
      isPhoneVerified: false,
      kycStatus: 'NOT_STARTED',
      countryCode: 'US',
    });
    walletRepository.find.mockResolvedValue([]);
    kycProfileRepository.findOne.mockRejectedValue(
      Object.assign(new Error('relation "kyc_profile" does not exist'), {
        code: '42P01',
      }),
    );

    await expect(service.getCurrentUser('legacy-user')).resolves.toEqual(
      expect.objectContaining({
        id: 'legacy-user',
        email: 'legacy@example.com',
        kycStatus: 'NOT_STARTED',
        kyc: expect.objectContaining({
          status: 'NOT_STARTED',
          statusMessage: expect.stringContaining('storage is unavailable'),
        }),
      }),
    );
    expect(kycProfileRepository.save).not.toHaveBeenCalled();
  });

  it('orders a US users default wallet and primary rail as USD', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      countryCode: 'US',
    });
    walletRepository.find.mockResolvedValue([
      {
        id: 'ngn-wallet',
        userId: 'user-1',
        currency: Currency.NGN,
        balance: 0,
      },
      {
        id: 'usd-wallet',
        userId: 'user-1',
        currency: Currency.USD,
        balance: 0,
      },
    ]);

    const result = await service.getWallets('user-1');

    expect(result.wallets[0].currency).toBe(Currency.USD);
  });

  it('does not fabricate account numbers when provider provisioning has not happened', async () => {
    walletRepository.find.mockResolvedValue([
      {
        id: 'usd-wallet',
        userId: 'user-1',
        currency: Currency.USD,
        balance: 0,
      },
    ]);
    walletRepository.findOne.mockResolvedValue({
      id: 'usd-wallet',
      userId: 'user-1',
      currency: Currency.USD,
      balance: 0,
      provider: 'Unit.co',
    });

    const response = await service.getWalletAccountDetails(
      'user-1',
      Currency.USD,
    );

    expect(response.accountDetails.isProvisioned).toBe(false);
    expect(response.accountDetails.accountNumber).toBeNull();
    expect(response.accountDetails.message).toContain('Unit');
  });

  it('persists blocked provider operations and returns structured unavailable errors', async () => {
    providerOperationRepository.findOne.mockResolvedValue(null);

    await expect(
      service.externalTransfer('user-1', {
        currency: Currency.USD,
        amount: 25,
        pin: '1234',
        idempotencyKey: 'idem-1',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(providerOperationRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        type: 'external_transfer',
        idempotencyKey: 'idem-1',
        status: 'BLOCKED',
        errorCode: 'PROVIDER_UNAVAILABLE',
        requestPayload: expect.objectContaining({ pin: '[REDACTED]' }),
      }),
    );
  });

  it('returns honest disabled portfolio values when crypto has no backend provider', async () => {
    userRepository.findOne.mockResolvedValue({ id: 'user-1' });

    const overview = await service.cryptoOverview('user-1');

    expect(overview.enabled).toBe(false);
    expect(overview.portfolio.totalValue).toBeNull();
    expect(overview.portfolio.positions).toEqual([]);
  });

  it('closes accounts by deactivating the real user after backend password verification', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      password: await hash('secret', 1),
    });

    await expect(
      service.closeAccount('user-1', { password: 'secret' }),
    ).resolves.toEqual(
      expect.objectContaining({
        closed: true,
        status: AccountStatus.DEACTIVATED,
      }),
    );
    expect(userRepository.update).toHaveBeenCalledWith('user-1', {
      status: AccountStatus.DEACTIVATED,
    });
  });

  it('blocks permanent account deletion until retention and provider offboarding exist', async () => {
    userRepository.findOne.mockResolvedValue({ id: 'user-1' });

    await expect(
      service.requestAccountDeletion('user-1', { reason: 'privacy' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('returns an honest disabled scheduled-transfer list', async () => {
    userRepository.findOne.mockResolvedValue({ id: 'user-1' });

    await expect(service.listScheduledTransfers('user-1')).resolves.toEqual(
      expect.objectContaining({ enabled: false, scheduledTransfers: [] }),
    );
  });

  it('persists blocked scheduled-transfer attempts without queuing fake money movement', async () => {
    providerOperationRepository.findOne.mockResolvedValue(null);

    await expect(
      service.createScheduledTransfer('user-1', {
        amount: 25,
        currency: Currency.USD,
        idempotencyKey: 'schedule-1',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(providerOperationRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        type: 'scheduled_transfer',
        idempotencyKey: 'schedule-1',
        status: 'BLOCKED',
      }),
    );
  });

  it('returns rewards from the real ledger and keeps redemption disabled', async () => {
    userRepository.findOne.mockResolvedValue({ id: 'user-1' });
    rewardLedgerRepository.find.mockResolvedValue([
      {
        id: 'reward-1',
        userId: 'user-1',
        type: 'EARN',
        points: 100,
        unit: 'POINTS',
        status: 'POSTED',
        source: 'REFERRAL',
        reference: 'reward-1',
      },
      {
        id: 'reward-2',
        userId: 'user-1',
        type: 'REDEEM',
        points: 25,
        unit: 'POINTS',
        status: 'POSTED',
        source: 'REDEMPTION',
        reference: 'reward-2',
      },
    ]);

    await expect(service.rewardsDashboard('user-1')).resolves.toEqual(
      expect.objectContaining({
        enabled: true,
        balance: 75,
        lifetimeEarned: 100,
        lifetimeRedeemed: 25,
        redemption: expect.objectContaining({ enabled: false }),
      }),
    );
  });

  it('tracks referral invites idempotently without creating fake earnings', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      referralCode: 'VIDAL123',
    });
    referralEventRepository.findOne.mockResolvedValue(null);
    referralEventRepository.save.mockImplementation(async (payload) => ({
      id: 'invite-1',
      ...payload,
    }));

    await expect(
      service.trackReferralInvite('user-1', {
        email: 'friend@example.com',
        idempotencyKey: 'invite-1',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        tracked: true,
        referralCode: 'VIDAL123',
        rewardCreated: false,
      }),
    );
    expect(referralEventRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        referrerUserId: 'user-1',
        inviteeEmail: 'friend@example.com',
        status: 'INVITED',
        idempotencyKey: 'invite-1',
      }),
    );
  });

  it('exposes account level and limit policy from verification state', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      isVerified: true,
      isPhoneVerified: false,
      kycStatus: 'NOT_STARTED',
    });
    kycProfileRepository.findOne.mockResolvedValue({
      id: 'kyc-1',
      userId: 'user-1',
      status: 'NOT_STARTED',
      limits: null,
    });

    await expect(service.getAccountLevel('user-1')).resolves.toEqual(
      expect.objectContaining({
        code: 'ACCOUNT_CREATED',
        level: 1,
        requirements: expect.arrayContaining(['VERIFY_PHONE', 'COMPLETE_KYC']),
      }),
    );
    await expect(service.getAccountLimits('user-1')).resolves.toEqual(
      expect.objectContaining({
        limits: expect.objectContaining({
          enforcement: expect.objectContaining({
            amountLimitsEnforced: false,
          }),
        }),
      }),
    );
  });

  it.each([
    ['IN_PROGRESS', [], 2, 'KYC_STARTED'],
    [
      'IN_PROGRESS',
      [{ section: 'GOVERNMENT_ID', status: 'SUBMITTED' }],
      3,
      'KYC_DOCUMENTS_SUBMITTED',
    ],
    ['VERIFIED', [], 4, 'KYC_VERIFIED'],
  ])(
    'maps KYC status %s and submitted sections to its onboarding level',
    async (kycStatus, sections, expectedLevel, expectedCode) => {
      userRepository.findOne.mockResolvedValue({
        id: 'user-1',
        isVerified: true,
        isPhoneVerified: true,
        kycStatus,
      });
      kycProfileRepository.findOne.mockResolvedValue({
        id: 'kyc-1',
        userId: 'user-1',
        status: kycStatus,
        sections,
        limits: null,
      });

      await expect(service.getAccountLevel('user-1')).resolves.toEqual(
        expect.objectContaining({
          code: expectedCode,
          level: expectedLevel,
          rank: expectedLevel,
        }),
      );
    },
  );

  it('maps a MetaMap webhook to KYC state and deduplicates the event', async () => {
    userRepository.findOne.mockResolvedValue({ id: 'user-1' });
    kycProfileRepository.findOne.mockResolvedValue({
      id: 'kyc-1',
      userId: 'user-1',
      status: 'IN_PROGRESS',
      region: 'US',
      capabilities: {},
      limits: {},
    });
    providerOperationRepository.findOne.mockResolvedValue(null);
    notificationPreferenceRepository.findOne.mockResolvedValue({
      userId: 'user-1',
      preferences: { push: false },
    });
    notificationDeviceRepository.find.mockResolvedValue([]);
    notificationRepository.find.mockResolvedValue([]);
    notificationRepository.create.mockImplementation((payload) => payload);

    const payload = {
      eventId: 'metamap-event-1',
      userId: 'user-1',
      status: 'APPROVED',
      verificationId: 'verification-1',
    };

    await expect(service.handleKycWebhook(payload)).resolves.toEqual(
      expect.objectContaining({
        received: true,
        updated: true,
        status: 'VERIFIED',
      }),
    );
    expect(userRepository.update).toHaveBeenCalledWith('user-1', {
      kycStatus: 'VERIFIED',
    });
    expect(kycProfileRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'VERIFIED',
        capabilities: expect.objectContaining({ canTransfer: true }),
        limits: expect.objectContaining({ accountProgressLevel: 4 }),
      }),
    );
    expect(providerOperationRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'kyc_webhook',
        idempotencyKey: 'metamap-event-1',
        status: 'APPLIED',
      }),
    );

    providerOperationRepository.findOne.mockResolvedValue({
      status: 'APPLIED',
      metadata: { status: 'VERIFIED' },
    });
    await expect(service.handleKycWebhook(payload)).resolves.toEqual(
      expect.objectContaining({
        received: true,
        updated: false,
        duplicate: true,
        status: 'VERIFIED',
      }),
    );
  });

  it('updates the returned KYC user and writes an admin review audit record', async () => {
    const targetUser = { id: 'user-1', kycStatus: 'IN_PROGRESS' };
    userRepository.findOne
      .mockResolvedValueOnce({ id: 'admin-1' })
      .mockResolvedValue(targetUser);
    kycProfileRepository.findOne.mockResolvedValue({
      id: 'kyc-1',
      userId: 'user-1',
      status: 'IN_PROGRESS',
      region: 'US',
      capabilities: {},
      limits: {},
    });
    notificationPreferenceRepository.findOne.mockResolvedValue({
      userId: 'user-1',
      preferences: { push: false },
    });
    notificationDeviceRepository.find.mockResolvedValue([]);
    notificationRepository.find.mockResolvedValue([]);

    const result = await service.reviewKyc('admin-1', 'user-1', 'VERIFIED');

    expect(result.user).toEqual(
      expect.objectContaining({ id: 'user-1', kycStatus: 'VERIFIED' }),
    );
    expect(providerOperationRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'kyc_admin_review',
        status: 'APPLIED',
        metadata: expect.objectContaining({
          adminUserId: 'admin-1',
          decision: 'VERIFIED',
        }),
      }),
    );
  });
});
