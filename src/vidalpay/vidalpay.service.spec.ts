import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash } from 'bcrypt';
import { DataSource } from 'typeorm';
import { AccountStatus } from 'src/database/entities/user.entity';
import { VidalpayService } from './vidalpay.service';
import { ProviderStatusService } from './provider-status.service';
import { FincraSandboxService } from './fincra-sandbox.service';
import { FincraWalletService } from './fincra-wallet.service';
import { JurisdictionService } from './jurisdiction.service';
import { ProductEligibilityService } from './product-eligibility.service';
import { WalletProductCatalogService } from './wallet-product-catalog.service';
import { Currency } from 'src/utils/enums/wallet.enum';
import { TagIdGenerator } from 'src/utils/tagIdGenerator';

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
  let fincraWebhookEventRepository: ReturnType<typeof repo>;
  let rewardLedgerRepository: ReturnType<typeof repo>;
  let referralEventRepository: ReturnType<typeof repo>;
  let notificationRepository: ReturnType<typeof repo>;
  let notificationPreferenceRepository: ReturnType<typeof repo>;
  let notificationDeviceRepository: ReturnType<typeof repo>;
  let cardRepository: ReturnType<typeof repo>;
  let fincraWalletService: {
    requestPermanentVirtualAccount: jest.Mock;
  };
  let sandboxProviderService: {
    createSudoCard: jest.Mock;
    getReloadlyCatalog: jest.Mock;
    validateReloadlyUtility: jest.Mock;
    purchaseReloadly: jest.Mock;
    verifyFincraBvn: jest.Mock;
    getFincraRates: jest.Mock;
    getVtuNgCatalog: jest.Mock;
    validateVtuNgCustomer: jest.Mock;
    purchaseVtuNg: jest.Mock;
  };
  let configService: { get: jest.Mock };
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
    fincraWebhookEventRepository = repo();
    rewardLedgerRepository = repo();
    referralEventRepository = repo();
    cardRepository = repo();
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
    fincraWalletService = {
      requestPermanentVirtualAccount: jest.fn(),
    };
    sandboxProviderService = {
      createSudoCard: jest.fn(),
      getReloadlyCatalog: jest.fn(),
      validateReloadlyUtility: jest.fn(),
      purchaseReloadly: jest.fn(),
      verifyFincraBvn: jest.fn(),
      getFincraRates: jest.fn(),
      getVtuNgCatalog: jest.fn(),
      validateVtuNgCustomer: jest.fn(),
      purchaseVtuNg: jest.fn(),
    };
    configService = { get: jest.fn() };

    service = new VidalpayService(
      userRepository as any,
      walletRepository as any,
      kycProfileRepository as any,
      transactionRepository as any,
      providerOperationRepository as any,
      fincraWebhookEventRepository as any,
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
      { probeReadOnly: jest.fn() } as unknown as FincraSandboxService,
      fincraWalletService as unknown as FincraWalletService,
      new ProductEligibilityService(new JurisdictionService()),
      new WalletProductCatalogService(
        configService as unknown as ConfigService,
      ),
      sandboxProviderService as any,
      configService as unknown as ConfigService,
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
      tagId: '$LEGACY001',
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

  it('returns the legacy user KYC status when KYC profile storage is absent', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'legacy-user',
      kycStatus: 'IN_PROGRESS',
      countryCode: 'NG',
    });
    kycProfileRepository.findOne.mockRejectedValue(
      Object.assign(new Error('relation "kyc_profile" does not exist'), {
        code: '42P01',
      }),
    );

    await expect(service.getKycStatus('legacy-user')).resolves.toEqual(
      expect.objectContaining({
        status: 'IN_PROGRESS',
        region: 'NG',
        storageStatus: 'LEGACY_FALLBACK',
        persistent: false,
      }),
    );
  });

  it('starts MetaMap using the existing user record when KYC profile storage is absent', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'legacy-user',
      kycStatus: 'NOT_STARTED',
      countryCode: 'NG',
    });
    kycProfileRepository.findOne.mockRejectedValue(
      Object.assign(new Error('relation "kyc_profile" does not exist'), {
        code: '42P01',
      }),
    );
    configService.get.mockImplementation(
      (key: string) =>
        ({
          METAMAP_CLIENT_ID: 'metamap-client',
          METAMAP_WORKFLOW_ID: 'metamap-workflow',
        })[key],
    );

    await expect(service.startKyc('legacy-user')).resolves.toEqual(
      expect.objectContaining({
        clientId: 'metamap-client',
        workflowId: 'metamap-workflow',
        metadata: expect.objectContaining({
          userId: 'legacy-user',
          profileId: null,
          region: 'NG',
        }),
      }),
    );
    expect(userRepository.update).toHaveBeenCalledWith('legacy-user', {
      kycStatus: 'IN_PROGRESS',
    });
    expect(kycProfileRepository.save).not.toHaveBeenCalled();
  });

  it('starts Fincra KYC as primary when Fincra KYC is configured and keeps MetaMap as fallback', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      kycStatus: 'NOT_STARTED',
      countryCode: 'NG',
    });
    kycProfileRepository.findOne.mockResolvedValue(null);
    kycProfileRepository.save.mockImplementation(async (payload: any) => ({
      id: 'kyc-1',
      ...payload,
    }));
    configService.get.mockImplementation(
      (key: string) =>
        ({
          FINCRA_KYC_ENABLED: 'true',
          FINCRA_API_KEY: 'fincra-key',
          FINCRA_BUSINESS_ID: 'business-1',
          METAMAP_CLIENT_ID: 'metamap-client',
          METAMAP_WORKFLOW_ID: 'metamap-workflow',
        })[key],
    );

    await expect(service.startKyc('user-1')).resolves.toEqual(
      expect.objectContaining({
        provider: 'FINCRA',
        mode: 'BACKEND_VERIFICATION',
        fallbackProvider: 'METAMAP',
        requirements: expect.arrayContaining(['bvn', 'government_id']),
        metadata: expect.objectContaining({ provider: 'FINCRA' }),
      }),
    );
  });

  it('submits BVN verification through Fincra without storing the raw BVN in provider operations', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      countryCode: 'NG',
      kycStatus: 'IN_PROGRESS',
    });
    kycProfileRepository.findOne.mockResolvedValue({
      id: 'kyc-1',
      userId: 'user-1',
      region: 'NG',
      provider: 'FINCRA',
      status: 'IN_PROGRESS',
      sections: {},
      identity: {},
      uploads: [],
      capabilities: {},
      limits: {},
    });
    providerOperationRepository.findOne.mockResolvedValue(null);
    providerOperationRepository.create.mockImplementation(
      (payload: any) => payload,
    );
    providerOperationRepository.save.mockImplementation(
      async (payload: any) => payload,
    );
    sandboxProviderService.verifyFincraBvn.mockResolvedValue({
      data: { id: 'verify-1', status: 'verified' },
    });
    configService.get.mockImplementation(
      (key: string) =>
        ({
          FINCRA_KYC_ENABLED: 'true',
          FINCRA_API_KEY: 'fincra-key',
          FINCRA_BUSINESS_ID: 'business-1',
        })[key],
    );

    await expect(
      service.submitKycSection('user-1', 'GOVERNMENT_ID', {
        bvn: '22222222222',
        idType: 'BVN',
      }),
    ).resolves.toEqual(expect.objectContaining({ provider: 'FINCRA' }));
    expect(sandboxProviderService.verifyFincraBvn).toHaveBeenCalledWith({
      bvn: '22222222222',
      businessId: 'business-1',
    });
    expect(providerOperationRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'kyc_fincra_bvn',
        requestPayload: expect.not.objectContaining({ bvn: '22222222222' }),
      }),
    );
  });

  it('returns read-only Fincra rates on the home contract and FX quotes without executing conversion', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      countryCode: 'NG',
      kycStatus: 'VERIFIED',
      pin: 'hashed',
    });
    kycProfileRepository.findOne.mockResolvedValue(null);
    sandboxProviderService.getFincraRates.mockResolvedValue({
      data: [
        {
          baseCurrency: 'NGN',
          quoteCurrency: 'USD',
          rate: 0.001,
        },
      ],
    });
    configService.get.mockImplementation((key: string) =>
      key === 'FINCRA_API_KEY' ? 'fincra-key' : undefined,
    );

    await expect(service.getHomeOverview('user-1')).resolves.toEqual(
      expect.objectContaining({
        exchangeRates: expect.objectContaining({
          provider: 'Fincra',
          rates: expect.arrayContaining([
            expect.objectContaining({ fromCurrency: 'NGN', toCurrency: 'USD' }),
          ]),
        }),
      }),
    );
    await expect(
      service.getFxQuote('user-1', {
        fromCurrency: 'NGN',
        toCurrency: 'USD',
        amount: 1000,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        executable: false,
        status: 'QUOTE_ONLY',
        estimatedAmount: 1,
      }),
    );
  });

  it('starts MetaMap when KYC profile storage has missing legacy columns', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'legacy-user',
      kycStatus: 'NOT_STARTED',
      countryCode: 'NG',
    });
    kycProfileRepository.findOne.mockRejectedValue(
      Object.assign(new Error('column kyc_profile.region does not exist'), {
        code: '42703',
      }),
    );
    configService.get.mockImplementation(
      (key: string) =>
        ({
          METAMAP_CLIENT_ID: 'metamap-client',
          METAMAP_WORKFLOW_ID: 'metamap-workflow',
        })[key],
    );

    await expect(service.startKyc('legacy-user')).resolves.toEqual(
      expect.objectContaining({
        clientId: 'metamap-client',
        workflowId: 'metamap-workflow',
        metadata: expect.objectContaining({
          userId: 'legacy-user',
          profileId: null,
          region: 'NG',
          storageAvailable: false,
        }),
      }),
    );
    expect(kycProfileRepository.save).not.toHaveBeenCalled();
  });

  it('starts MetaMap even when saving an existing KYC profile hits a legacy schema gap', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'legacy-user',
      kycStatus: 'NOT_STARTED',
      countryCode: 'NG',
    });
    kycProfileRepository.findOne.mockResolvedValue({
      id: 'kyc-1',
      userId: 'legacy-user',
      region: 'NG',
      provider: null,
      status: 'NOT_STARTED',
    });
    kycProfileRepository.save.mockRejectedValue(
      Object.assign(new Error('column provider does not exist'), {
        code: '42703',
      }),
    );
    configService.get.mockImplementation(
      (key: string) =>
        ({
          METAMAP_CLIENT_ID: 'metamap-client',
          METAMAP_WORKFLOW_ID: 'metamap-workflow',
        })[key],
    );

    await expect(service.startKyc('legacy-user')).resolves.toEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({
          userId: 'legacy-user',
          profileId: null,
          region: 'NG',
          storageAvailable: false,
        }),
      }),
    );
    expect(userRepository.update).toHaveBeenCalledWith('legacy-user', {
      kycStatus: 'IN_PROGRESS',
    });
  });

  it('starts MetaMap when Postgres reports a schema-qualified missing KYC table', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'legacy-user',
      kycStatus: 'NOT_STARTED',
      countryCode: 'NG',
    });
    kycProfileRepository.findOne.mockRejectedValue(
      Object.assign(new Error('relation "public.kyc_profile" does not exist'), {
        code: '42P01',
      }),
    );
    configService.get.mockImplementation(
      (key: string) =>
        ({
          METAMAP_CLIENT_ID: 'metamap-client',
          METAMAP_WORKFLOW_ID: 'metamap-workflow',
        })[key],
    );

    await expect(service.startKyc('legacy-user')).resolves.toEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({
          userId: 'legacy-user',
          profileId: null,
          region: 'NG',
        }),
      }),
    );
    expect(kycProfileRepository.save).not.toHaveBeenCalled();
  });

  it('assigns a missing TAG to an existing user during session restoration', async () => {
    const tagSpy = jest
      .spyOn(TagIdGenerator, 'generateUniqueTagId')
      .mockResolvedValue('$ABC123456');
    userRepository.findOne.mockResolvedValue({
      id: 'legacy-user',
      email: 'legacy@example.com',
      kycStatus: 'NOT_STARTED',
      countryCode: 'NG',
    });
    walletRepository.find.mockResolvedValue([]);
    kycProfileRepository.findOne.mockRejectedValue(
      Object.assign(new Error('relation "kyc_profile" does not exist'), {
        code: '42P01',
      }),
    );

    await expect(service.getCurrentUser('legacy-user')).resolves.toEqual(
      expect.objectContaining({ tagId: '$ABC123456' }),
    );
    expect(userRepository.update).toHaveBeenCalledWith('legacy-user', {
      tagId: '$ABC123456',
    });
    tagSpy.mockRestore();
  });

  it('resolves TAG beneficiaries regardless of mobile @/$ prefixes or case', async () => {
    const where = jest.fn().mockReturnThis();
    const getOne = jest.fn().mockResolvedValue({
      id: 'recipient-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      tagId: '$AbC123456',
    });
    userRepository.createQueryBuilder.mockReturnValue({ where, getOne });

    await expect(service.resolveBeneficiary('@$abc123456')).resolves.toEqual(
      expect.objectContaining({
        recipient: expect.objectContaining({
          id: 'recipient-1',
          tagId: '$AbC123456',
        }),
      }),
    );
    expect(where).toHaveBeenCalledWith(expect.any(String), {
      normalized: 'abc123456',
    });
  });

  it('reports internal transfer storage unavailable when operation storage is absent', async () => {
    providerOperationRepository.findOne.mockRejectedValue(
      Object.assign(
        new Error('relation "public.provider_operation" does not exist'),
        { code: '42P01' },
      ),
    );

    await expect(
      service.internalTransfer('user-1', {
        currency: Currency.NGN,
        amount: 100,
        recipientTag: '@$abc123456',
        idempotencyKey: 'transfer-1',
        pin: '1234',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'FEATURE_STORAGE_UNAVAILABLE',
        feature: 'internal transfers',
      }),
    });
  });

  it('normalizes Reloadly utility billers into mobile categories', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      countryCode: 'NG',
    });
    configService.get.mockImplementation((key: string) =>
      key === 'RELOADLY_CLIENT_ID' || key === 'RELOADLY_CLIENT_SECRET'
        ? 'configured'
        : undefined,
    );
    sandboxProviderService.getReloadlyCatalog.mockResolvedValue({
      content: [
        {
          id: 44,
          name: 'Test Electricity',
          serviceType: 'electricity-test',
          category: { name: 'Electricity', code: 'electricity' },
        },
      ],
    });

    await expect(service.getCatalog('user-1', 'utilities')).resolves.toEqual(
      expect.objectContaining({
        provider: 'Reloadly',
        categories: [
          expect.objectContaining({
            code: 'electricity',
            providers: [expect.objectContaining({ code: 'electricity-test' })],
          }),
        ],
      }),
    );
  });

  it('returns an honest empty card state when legacy card storage is absent', async () => {
    cardRepository.find.mockRejectedValue(
      Object.assign(new Error('relation "card" does not exist'), {
        code: '42P01',
      }),
    );

    await expect(service.listCards('legacy-user')).resolves.toEqual(
      expect.objectContaining({
        cards: [],
        storageStatus: 'LEGACY_STORAGE_UNAVAILABLE',
      }),
    );
  });

  it('returns non-persistent notification defaults for a legacy database', async () => {
    notificationPreferenceRepository.findOne.mockRejectedValue(
      Object.assign(
        new Error('relation "notification_preference" does not exist'),
        { code: '42P01' },
      ),
    );
    notificationDeviceRepository.find.mockRejectedValue(
      Object.assign(
        new Error('relation "notification_device" does not exist'),
        {
          code: '42P01',
        },
      ),
    );

    await expect(
      service.getNotificationPreferences('legacy-user'),
    ).resolves.toEqual(
      expect.objectContaining({
        push: true,
        persistent: false,
        storageStatus: 'LEGACY_FALLBACK',
      }),
    );
    await expect(
      service.listNotificationDevices('legacy-user'),
    ).resolves.toEqual(
      expect.objectContaining({
        devices: [],
        persistent: false,
        storageStatus: 'LEGACY_STORAGE_UNAVAILABLE',
      }),
    );
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
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      countryCode: 'US',
      region: 'US',
    });

    const overview = await service.cryptoOverview('user-1');

    expect(overview.enabled).toBe(false);
    expect(overview.portfolio.totalValue).toBeNull();
    expect(overview.portfolio.positions).toEqual([]);
  });

  it('blocks Nigeria-based users from restricted products even after KYC verification', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      countryCode: 'NG',
      region: 'NG',
      phoneNumber: '+2348012345678',
      kycStatus: 'VERIFIED',
    });

    await expect(service.cryptoOverview('user-1')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PRODUCT_NOT_AVAILABLE_IN_JURISDICTION',
        capability: 'crypto',
      }),
    });
    await expect(service.investmentProducts('user-1')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PRODUCT_NOT_AVAILABLE_IN_JURISDICTION',
        capability: 'investments',
      }),
    });
    await expect(service.loanOverview('user-1')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PRODUCT_NOT_AVAILABLE_IN_JURISDICTION',
        capability: 'lending',
      }),
    });
    await expect(service.taxStatus('user-1')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PRODUCT_NOT_AVAILABLE_IN_JURISDICTION',
        capability: 'foreign_tax',
      }),
    });
  });

  it('reports mobile-visible product capabilities without changing transactions', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      countryCode: 'NG',
      region: 'NG',
      phoneNumber: '+2348012345678',
    });

    const capabilities = await service.getProductCapabilities('user-1');

    expect(capabilities.jurisdiction.jurisdiction).toBe('NG');
    expect(capabilities.products.wallets.enabled).toBe(true);
    expect(capabilities.products.utilities.enabled).toBe(true);
    expect(capabilities.products.crypto.blockedResponse).toEqual(
      expect.objectContaining({
        code: 'PRODUCT_NOT_AVAILABLE_IN_JURISDICTION',
        provider: 'VidalPay Compliance',
      }),
    );
    expect(providerOperationRepository.save).not.toHaveBeenCalled();
  });

  it('returns available wallet products excluding active wallets', async () => {
    userRepository.findOne.mockResolvedValue({ id: 'user-1', region: 'NG' });
    walletRepository.find.mockResolvedValue([
      {
        id: 'ngn-wallet',
        userId: 'user-1',
        currency: Currency.NGN,
        balance: 0,
      },
    ]);
    providerOperationRepository.findOne.mockResolvedValue(null);
    kycProfileRepository.findOne.mockResolvedValue(null);

    const result = await service.getAvailableWalletProducts('user-1');

    expect(result.products.map((product) => product.currency)).not.toContain(
      'NGN',
    );
    expect(result.products.map((product) => product.currency)).toEqual(
      expect.arrayContaining(['USD', 'GBP']),
    );
    expect(walletRepository.save).not.toHaveBeenCalled();
  });

  it('excludes wallet products with pending activation requests', async () => {
    userRepository.findOne.mockResolvedValue({ id: 'user-1', region: 'NG' });
    walletRepository.find.mockResolvedValue([]);
    kycProfileRepository.findOne.mockResolvedValue(null);
    providerOperationRepository.findOne.mockImplementation(
      async ({ where }: any) =>
        where?.idempotencyKey === 'wallet_activation:user-1:GBP'
          ? {
              id: 'op-1',
              reference: 'op-1',
              status: 'PENDING',
              currency: 'GBP',
              provider: 'FINCRA',
            }
          : null,
    );

    const result = await service.getAvailableWalletProducts('user-1');

    expect(result.products.map((product) => product.currency)).not.toContain(
      'GBP',
    );
  });

  it('returns additional enabled Fincra currency products from explicit catalogue config', async () => {
    (configService.get as jest.Mock).mockImplementation((key: string) =>
      key === 'FINCRA_WALLET_PRODUCTS_JSON'
        ? JSON.stringify([
            {
              currency: 'CAD',
              enabled: true,
              tier: 'ADDITIONAL',
              supportedJurisdictions: ['NG'],
              canProvision: false,
              requirementsConfigured: true,
              requirements: [],
            },
            {
              currency: 'EUR',
              enabled: true,
              tier: 'ADDITIONAL',
              supportedJurisdictions: ['NG'],
            },
          ])
        : undefined,
    );
    userRepository.findOne.mockResolvedValue({ id: 'user-1', region: 'NG' });
    walletRepository.find.mockResolvedValue([]);
    providerOperationRepository.findOne.mockResolvedValue(null);
    kycProfileRepository.findOne.mockResolvedValue(null);

    const result = await service.getAvailableWalletProducts('user-1');

    expect(result.products.map((product) => product.currency)).toContain('CAD');
    expect(result.products.map((product) => product.currency)).not.toContain(
      'EUR',
    );
  });

  it('evaluates fully satisfied wallet product requirements individually', async () => {
    (configService.get as jest.Mock).mockImplementation((key: string) =>
      key === 'FINCRA_WALLET_PRODUCTS_JSON'
        ? JSON.stringify([
            {
              currency: 'GBP',
              enabled: true,
              tier: 'PRIMARY',
              supportedJurisdictions: ['NG'],
              canProvision: false,
              requirementsConfigured: true,
              requirements: [
                {
                  key: 'legal_name',
                  label: 'Legal name',
                  source: 'VIDALPAY_PROFILE',
                },
                {
                  key: 'date_of_birth',
                  label: 'Date of birth',
                  source: 'VIDALPAY_PROFILE',
                },
                { key: 'address', label: 'Address', source: 'METAMAP' },
                {
                  key: 'government_id',
                  label: 'Government ID',
                  source: 'METAMAP',
                },
              ],
            },
          ])
        : undefined,
    );
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      region: 'NG',
      firstName: 'Ada',
      lastName: 'Lovelace',
      dateOfBirth: '1990-01-01',
    });
    walletRepository.find.mockResolvedValue([]);
    providerOperationRepository.findOne.mockResolvedValue(null);
    kycProfileRepository.findOne.mockResolvedValue({
      userId: 'user-1',
      status: 'VERIFIED',
      identity: { address: '1 Lagos Street', nin: '12345678901' },
      uploads: [],
      sections: [],
    });

    const result = await service.getWalletEligibility('user-1', 'GBP');

    expect(result.missingRequirements).toEqual([]);
    expect(result.satisfiedRequirements.map((item) => item.key)).toEqual(
      expect.arrayContaining([
        'legal_name',
        'date_of_birth',
        'address',
        'government_id',
      ]),
    );
  });

  it('returns only missing wallet requirements and does not treat MetaMap VERIFIED as all-satisfied', async () => {
    (configService.get as jest.Mock).mockImplementation((key: string) =>
      key === 'FINCRA_WALLET_PRODUCTS_JSON'
        ? JSON.stringify([
            {
              currency: 'GBP',
              enabled: true,
              tier: 'PRIMARY',
              supportedJurisdictions: ['NG'],
              canProvision: false,
              requirementsConfigured: true,
              requirements: [
                {
                  key: 'legal_name',
                  label: 'Legal name',
                  source: 'VIDALPAY_PROFILE',
                },
                {
                  key: 'proof_of_address',
                  label: 'Proof of address',
                  source: 'FINCRA',
                },
              ],
            },
          ])
        : undefined,
    );
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      region: 'NG',
      firstName: 'Ada',
      lastName: 'Lovelace',
      kycStatus: 'VERIFIED',
    });
    walletRepository.find.mockResolvedValue([]);
    providerOperationRepository.findOne.mockResolvedValue(null);
    kycProfileRepository.findOne.mockResolvedValue({
      userId: 'user-1',
      status: 'VERIFIED',
      identity: {},
      uploads: [],
      sections: [],
    });

    const result = await service.getWalletEligibility('user-1', 'GBP');

    expect(result.status).toBe('REQUIRES_INFORMATION');
    expect(result.satisfiedRequirements.map((item) => item.key)).toContain(
      'legal_name',
    );
    expect(result.missingRequirements).toEqual([
      expect.objectContaining({ key: 'proof_of_address' }),
    ]);
  });

  it('rejects unavailable wallet products outside the Fincra-enabled catalogue', async () => {
    userRepository.findOne.mockResolvedValue({ id: 'user-1', region: 'NG' });
    walletRepository.find.mockResolvedValue([]);

    const result = await service.getWalletEligibility('user-1', 'CAD');

    expect(result.status).toBe('PRODUCT_UNAVAILABLE');
    expect(result.eligible).toBe(false);
  });

  it('does not activate when requirements are incomplete', async () => {
    (configService.get as jest.Mock).mockImplementation((key: string) =>
      key === 'FINCRA_WALLET_PRODUCTS_JSON'
        ? JSON.stringify([
            {
              currency: 'GBP',
              enabled: true,
              tier: 'PRIMARY',
              supportedJurisdictions: ['NG'],
              canProvision: true,
              providerProductId: 'gbp-product',
              requirementsConfigured: true,
              requirements: [
                {
                  key: 'proof_of_address',
                  label: 'Proof of address',
                  source: 'FINCRA',
                },
              ],
            },
          ])
        : 'configured',
    );
    userRepository.findOne.mockResolvedValue({ id: 'user-1', region: 'NG' });
    walletRepository.find.mockResolvedValue([]);
    providerOperationRepository.findOne.mockResolvedValue(null);
    kycProfileRepository.findOne.mockResolvedValue({
      userId: 'user-1',
      status: 'VERIFIED',
      identity: {},
      uploads: [],
      sections: [],
    });

    const result = await service.activateWalletProduct('user-1', 'GBP', {});

    expect(result.activation.status).toBe('REQUIRES_INFORMATION');
    expect(walletRepository.save).not.toHaveBeenCalled();
    expect(providerOperationRepository.save).not.toHaveBeenCalled();
  });

  it('does not recreate an already-active wallet', async () => {
    userRepository.findOne.mockResolvedValue({ id: 'user-1', region: 'NG' });
    walletRepository.find.mockResolvedValue([
      { id: 'gbp-wallet', userId: 'user-1', currency: 'GBP', balance: 0 },
    ]);
    providerOperationRepository.findOne.mockResolvedValue(null);
    kycProfileRepository.findOne.mockResolvedValue(null);

    const result = await service.activateWalletProduct('user-1', 'GBP', {});

    expect(result.activation.status).toBe('ALREADY_ACTIVE');
    expect(walletRepository.save).not.toHaveBeenCalled();
  });

  it('does not create duplicate activation when one is pending', async () => {
    userRepository.findOne.mockResolvedValue({ id: 'user-1', region: 'NG' });
    walletRepository.find.mockResolvedValue([]);
    providerOperationRepository.findOne.mockResolvedValue({
      id: 'op-1',
      reference: 'op-1',
      status: 'PENDING',
      currency: 'GBP',
      provider: 'FINCRA',
    });
    kycProfileRepository.findOne.mockResolvedValue(null);

    const result = await service.activateWalletProduct('user-1', 'GBP', {});

    expect(result.activation.status).toBe('PENDING');
    expect(providerOperationRepository.save).not.toHaveBeenCalled();
  });

  it('returns honest provider-not-configured activation state without creating a fake account', async () => {
    userRepository.findOne.mockResolvedValue({ id: 'user-1', region: 'NG' });
    walletRepository.find.mockResolvedValue([]);
    providerOperationRepository.findOne.mockResolvedValue(null);
    kycProfileRepository.findOne.mockResolvedValue(null);

    const result = await service.activateWalletProduct('user-1', 'GBP', {});

    expect(result.status).toBe('PROVIDER_NOT_CONFIGURED');
    expect(result.activation.status).toBe('PROVIDER_NOT_CONFIGURED');
    expect(walletRepository.save).not.toHaveBeenCalled();
  });

  it('submits a real Fincra sandbox virtual account request without creating a fake wallet', async () => {
    (configService.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'FINCRA_WALLET_PRODUCTS_JSON') {
        return JSON.stringify([
          {
            currency: 'GBP',
            enabled: true,
            tier: 'PRIMARY',
            supportedJurisdictions: ['NG'],
            canProvision: true,
            providerProductId: 'gbp-product',
            requirementsConfigured: true,
            requirements: [],
          },
        ]);
      }
      if (key === 'FINCRA_API_KEY') return 'configured';
      if (key === 'FINCRA_BASE_URL') return 'https://sandboxapi.fincra.com';
      return undefined;
    });
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      region: 'NG',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      phoneNumber: '+2348012345678',
      country: 'Nigeria',
      countryCode: 'NG',
      addressLine1: '1 Test Street',
      city: 'Lagos',
      stateOrRegion: 'Lagos',
    });
    walletRepository.find.mockResolvedValue([]);
    providerOperationRepository.findOne.mockResolvedValue(null);
    providerOperationRepository.create.mockImplementation(
      (payload: any) => payload,
    );
    providerOperationRepository.save.mockImplementation(
      async (payload: any) => ({
        ...payload,
        metadata: payload.metadata ? { ...payload.metadata } : payload.metadata,
      }),
    );
    kycProfileRepository.findOne.mockResolvedValue(null);
    fincraWalletService.requestPermanentVirtualAccount.mockResolvedValue({
      status: 200,
      data: {
        success: true,
        data: { id: 'fincra-request-1', status: 'pending' },
      },
      providerReference: 'fincra-request-1',
      requestStatus: 'PENDING',
    });

    const result = await service.activateWalletProduct('user-1', 'GBP', {
      termsAccepted: true,
    });

    expect(
      fincraWalletService.requestPermanentVirtualAccount,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: 'GBP',
        accountType: 'individual',
        isTermsAccepted: true,
        KYCInformation: expect.objectContaining({
          firstName: 'Ada',
          lastName: 'Lovelace',
          email: 'ada@example.com',
        }),
      }),
    );
    expect(providerOperationRepository.save).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: 'wallet_activation',
        status: 'SUBMITTING',
        currency: 'GBP',
        provider: 'FINCRA',
        requestPayload: expect.objectContaining({
          hasKycInformation: true,
          suppliedKycFields: expect.arrayContaining([
            'firstName',
            'lastName',
            'email',
          ]),
        }),
      }),
    );
    expect(providerOperationRepository.save).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: 'wallet_activation',
        status: 'PENDING',
        currency: 'GBP',
        provider: 'FINCRA',
        providerReference: 'fincra-request-1',
      }),
    );
    expect(walletRepository.save).not.toHaveBeenCalled();
    expect(result.status).toBe('PENDING');
    expect(result.activation.providerReference).toBe('fincra-request-1');
  });

  it('marks retryable Fincra timeouts as ambiguous for later reconciliation', async () => {
    (configService.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'FINCRA_WALLET_PRODUCTS_JSON') {
        return JSON.stringify([
          {
            currency: 'CAD',
            enabled: true,
            tier: 'ADDITIONAL',
            supportedJurisdictions: ['NG'],
            canProvision: true,
            requirementsConfigured: true,
            requirements: [],
          },
        ]);
      }
      if (key === 'FINCRA_API_KEY') return 'configured';
      if (key === 'FINCRA_BASE_URL') return 'https://sandboxapi.fincra.com';
      return undefined;
    });
    userRepository.findOne.mockResolvedValue({ id: 'user-1', region: 'NG' });
    walletRepository.find.mockResolvedValue([]);
    providerOperationRepository.findOne.mockResolvedValue(null);
    providerOperationRepository.create.mockImplementation(
      (payload: any) => payload,
    );
    providerOperationRepository.save.mockImplementation(
      async (payload: any) => payload,
    );
    kycProfileRepository.findOne.mockResolvedValue(null);
    fincraWalletService.requestPermanentVirtualAccount.mockRejectedValue({
      response: {
        message: {
          code: 'FINCRA_REQUEST_TIMEOUT',
          message: 'Fincra request timed out.',
          retryable: true,
        },
      },
    });

    const result = await service.activateWalletProduct('user-1', 'CAD', {});

    expect(result.status).toBe('PROVIDER_REQUEST_FAILED');
    expect(providerOperationRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'AMBIGUOUS_PROVIDER_STATE',
        currency: 'CAD',
        errorCode: 'FINCRA_REQUEST_TIMEOUT',
        metadata: expect.objectContaining({
          retryable: true,
          reconciliationRequired: true,
        }),
      }),
    );
    expect(walletRepository.save).not.toHaveBeenCalled();
  });

  it('records failed Fincra activation requests without creating wallets or changing balances', async () => {
    (configService.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'FINCRA_WALLET_PRODUCTS_JSON') {
        return JSON.stringify([
          {
            currency: 'CAD',
            enabled: true,
            tier: 'ADDITIONAL',
            supportedJurisdictions: ['NG'],
            canProvision: true,
            requirementsConfigured: true,
            requirements: [],
          },
        ]);
      }
      if (key === 'FINCRA_API_KEY') return 'configured';
      if (key === 'FINCRA_BASE_URL') return 'https://sandboxapi.fincra.com';
      return undefined;
    });
    userRepository.findOne.mockResolvedValue({ id: 'user-1', region: 'NG' });
    walletRepository.find.mockResolvedValue([]);
    providerOperationRepository.findOne.mockResolvedValue(null);
    providerOperationRepository.create.mockImplementation(
      (payload: any) => payload,
    );
    providerOperationRepository.save.mockImplementation(
      async (payload: any) => payload,
    );
    kycProfileRepository.findOne.mockResolvedValue(null);
    fincraWalletService.requestPermanentVirtualAccount.mockRejectedValue({
      response: {
        message: {
          code: 'FINCRA_VIRTUAL_ACCOUNT_REQUEST_FAILED',
          message: 'Fincra request timed out.',
        },
      },
    });

    const result = await service.activateWalletProduct('user-1', 'CAD', {});

    expect(result.status).toBe('PROVIDER_REQUEST_FAILED');
    expect(providerOperationRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED',
        currency: 'CAD',
        errorCode: 'FINCRA_VIRTUAL_ACCOUNT_REQUEST_FAILED',
      }),
    );
    expect(walletRepository.save).not.toHaveBeenCalled();
  });

  it('persists real Fincra wallet account details from an authenticated approved webhook', async () => {
    const payload = {
      id: 'event-1',
      event: 'virtual_account.approved',
      data: {
        id: 'fincra-request-1',
        status: 'approved',
        account: {
          accountNumber: '1234567890',
          accountName: 'Ada Lovelace',
          bankName: 'Fincra Bank',
        },
      },
    };
    configService.get.mockImplementation((key: string) =>
      key === 'FINCRA_WEBHOOK_SECRET' ? 'secret' : undefined,
    );
    const signature = require('crypto')
      .createHmac('sha512', 'secret')
      .update(JSON.stringify(payload))
      .digest('hex');
    providerOperationRepository.findOne.mockResolvedValue({
      id: 'op-1',
      userId: 'user-1',
      type: 'wallet_activation',
      idempotencyKey: 'wallet_activation:user-1:CAD',
      reference: 'wallet_activation:user-1:CAD',
      providerReference: 'fincra-request-1',
      status: 'PENDING',
      currency: 'CAD',
      metadata: {},
    });
    providerOperationRepository.save.mockImplementation(
      async (payload: any) => payload,
    );

    await expect(
      service.handleFincraWebhook(payload, signature),
    ).resolves.toEqual(
      expect.objectContaining({
        received: true,
        provider: 'FINCRA',
        updated: true,
        walletUpdated: true,
      }),
    );
    expect(walletRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        currency: Currency.CAD,
        balance: 0,
        accountNumber: '1234567890',
        accountName: 'Ada Lovelace',
        bankName: 'Fincra Bank',
        provider: 'FINCRA',
        providerStatus: 'ACTIVE',
        providerReference: 'fincra-request-1',
      }),
    );
    expect(providerOperationRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ACTIVE',
        metadata: expect.objectContaining({
          providerWebhookEventId: 'event-1',
          providerWebhookEventIds: ['event-1'],
          providerAccountDetailsAvailable: true,
          walletPersistenceBlocked: null,
          walletPersistenceStatus: 'PERSISTED',
        }),
      }),
    );
  });

  it('deduplicates Fincra webhook event ids on the existing provider operation', async () => {
    const payload = {
      id: 'event-1',
      event: 'virtual_account.approved',
      data: {
        id: 'fincra-request-1',
        status: 'approved',
      },
    };
    configService.get.mockImplementation((key: string) =>
      key === 'FINCRA_WEBHOOK_SECRET' ? 'secret' : undefined,
    );
    const signature = require('crypto')
      .createHmac('sha512', 'secret')
      .update(JSON.stringify(payload))
      .digest('hex');
    providerOperationRepository.findOne.mockResolvedValue({
      id: 'op-1',
      userId: 'user-1',
      type: 'wallet_activation',
      idempotencyKey: 'wallet_activation:user-1:CAD',
      reference: 'wallet_activation:user-1:CAD',
      providerReference: 'fincra-request-1',
      status: 'PENDING',
      metadata: { providerWebhookEventIds: ['event-1'] },
    });

    await expect(
      service.handleFincraWebhook(payload, signature),
    ).resolves.toEqual(
      expect.objectContaining({
        received: true,
        provider: 'FINCRA',
        updated: false,
        duplicate: true,
        walletUpdated: false,
      }),
    );
    expect(providerOperationRepository.save).not.toHaveBeenCalled();
    expect(walletRepository.save).not.toHaveBeenCalled();
  });

  it('keeps Nigerian restrictions after eligibility for foreign-currency wallets', async () => {
    (configService.get as jest.Mock).mockImplementation((key: string) =>
      key === 'FINCRA_WALLET_PRODUCTS_JSON'
        ? JSON.stringify([
            {
              currency: 'CAD',
              enabled: true,
              tier: 'ADDITIONAL',
              supportedJurisdictions: ['NG'],
              canProvision: false,
              requirementsConfigured: true,
              requirements: [],
            },
          ])
        : undefined,
    );
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      region: 'NG',
      country: 'Nigeria',
      phoneNumber: '+2348012345678',
      kycStatus: 'VERIFIED',
    });
    walletRepository.find.mockResolvedValue([
      {
        id: 'usd-wallet',
        userId: 'user-1',
        currency: Currency.USD,
        balance: 0,
      },
    ]);
    providerOperationRepository.findOne.mockResolvedValue(null);
    kycProfileRepository.findOne.mockResolvedValue(null);

    await expect(
      service.getWalletEligibility('user-1', 'EUR'),
    ).resolves.toEqual(expect.objectContaining({ currency: 'EUR' }));
    await expect(service.cryptoOverview('user-1')).rejects.toMatchObject({
      response: expect.objectContaining({ capability: 'crypto' }),
    });
    await expect(service.investmentsOverview('user-1')).rejects.toMatchObject({
      response: expect.objectContaining({ capability: 'investments' }),
    });
    await expect(service.loanOverview('user-1')).rejects.toMatchObject({
      response: expect.objectContaining({ capability: 'lending' }),
    });
    await expect(service.taxStatus('user-1')).rejects.toMatchObject({
      response: expect.objectContaining({ capability: 'foreign_tax' }),
    });
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
    ['RETRY_REQUIRED', [], 2, 'KYC_ACTION_REQUIRED'],
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

  it('lets admins request more KYC information and exposes action-required status to mobile', async () => {
    const targetUser = { id: 'user-1', kycStatus: 'UNDER_REVIEW' };
    userRepository.findOne
      .mockResolvedValueOnce({ id: 'admin-1' })
      .mockResolvedValue(targetUser);
    kycProfileRepository.findOne.mockResolvedValue({
      id: 'kyc-1',
      userId: 'user-1',
      status: 'UNDER_REVIEW',
      region: 'NG',
      capabilities: {},
      limits: {},
      sections: [
        { section: 'GOVERNMENT_ID', status: 'SUBMITTED', completed: true },
        { section: 'ADDRESS', status: 'SUBMITTED', completed: true },
        { section: 'LIVENESS', status: 'SUBMITTED', completed: true },
      ],
      identity: {},
    });
    notificationPreferenceRepository.findOne.mockResolvedValue({
      userId: 'user-1',
      preferences: { push: false },
    });
    notificationDeviceRepository.find.mockResolvedValue([]);
    notificationRepository.find.mockResolvedValue([]);

    const result = await service.requestKycInformation('admin-1', 'user-1', {
      reason: 'Proof of address is unclear',
      missingRequirements: ['proof of address', 'liveness-check'],
      message: 'Please upload a clearer proof of address.',
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'ACTION_REQUIRED',
        kycStatus: 'RETRY_REQUIRED',
        accountLevel: 2,
        missingRequirements: ['proof_of_address', 'liveness_check'],
      }),
    );
    expect(userRepository.update).toHaveBeenCalledWith('user-1', {
      kycStatus: 'RETRY_REQUIRED',
    });
    expect(kycProfileRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'RETRY_REQUIRED',
        statusMessage: 'Please upload a clearer proof of address.',
        rejectionReason: 'Proof of address is unclear',
        identity: expect.objectContaining({
          missingRequirements: ['proof_of_address', 'liveness_check'],
          actionRequired: expect.objectContaining({
            required: true,
            status: 'RETRY_REQUIRED',
          }),
        }),
        limits: expect.objectContaining({ accountProgressLevel: 2 }),
      }),
    );
    expect(providerOperationRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'kyc_admin_review',
        requestPayload: expect.objectContaining({
          decision: 'RETRY_REQUIRED',
          missingRequirements: ['proof_of_address', 'liveness_check'],
        }),
      }),
    );
  });

  it('creates and persists a Sudo NGN card with PIN and idempotency checks', async () => {
    const pin = await hash('1234', 4);
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      country: 'Nigeria',
      pin,
    });
    providerStatusService.isCapabilityEnabled.mockReturnValue(true);
    providerOperationRepository.findOne.mockResolvedValue(null);
    sandboxProviderService.createSudoCard.mockResolvedValue({
      data: { id: 'sudo-card-1', status: 'active', last4: '1234' },
    });

    const result = await service.createCard('user-1', 'virtual', {
      currency: 'NGN',
      transactionPin: '1234',
      idempotencyKey: 'card-request-1',
      cardholderId: 'holder-1',
      fundingSourceId: 'funding-1',
    });

    expect(sandboxProviderService.createSudoCard).toHaveBeenCalledTimes(1);
    expect(cardRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'Sudo',
        providerCardId: 'sudo-card-1',
        currency: Currency.NGN,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({ providerCardId: 'sudo-card-1' }),
    );
  });

  it('saves a local support ticket when Zendesk is unavailable', async () => {
    const supportTicketRepository = (service as any).supportTicketRepository;
    supportTicketRepository.create.mockImplementation((payload: any) => ({
      id: 'ticket-1',
      ...payload,
    }));
    supportTicketRepository.save.mockImplementation(
      async (payload: any) => payload,
    );
    providerStatusService.getStatus.mockReturnValue(
      status({
        capability: 'zendesk_support',
        provider: 'Zendesk',
        enabled: false,
        readinessStatus: 'MISSING_CREDENTIALS',
        missingEnvVars: ['ZENDESK_SUBDOMAIN', 'ZENDESK_OAUTH_TOKEN'],
      }) as any,
    );

    await expect(
      service.createSupportTicket('user-1', {
        subject: 'Need help',
        message: 'Please assist',
      }),
    ).resolves.toMatchObject({
      ticket: { id: 'ticket-1', userId: 'user-1' },
      providerSync: { provider: 'Zendesk', status: 'NOT_CONFIGURED' },
    });
  });

  it('submits VTU.ng purchases without wallet debit and waits for requery or webhook settlement', async () => {
    const pin = await hash('1234', 4);
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      country: 'Nigeria',
      pin,
    });
    providerOperationRepository.findOne.mockResolvedValue(null);
    providerOperationRepository.create.mockImplementation(
      (payload: any) => payload,
    );
    providerOperationRepository.save.mockImplementation(
      async (payload: any) => payload,
    );
    providerStatusService.getStatus.mockImplementation(
      (capability: any) =>
        status({
          capability,
          provider: capability === 'vtu_purchase' ? 'VTU.ng' : 'Unit.co',
          enabled: capability === 'vtu_purchase',
          missingEnvVars: [],
        }) as any,
    );

    sandboxProviderService.purchaseVtuNg.mockResolvedValue({
      request_id: 'vtu-airtime-1',
      code: 'success',
    });

    await expect(
      service.purchaseService('user-1', 'airtime', {
        amount: 1000,
        currency: 'NGN',
        transactionPin: '1234',
        idempotencyKey: 'vtu-airtime-1',
        serviceId: 'mtn',
        phone: '08030000000',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        reference: 'vtu-airtime-1',
        status: 'SUBMITTED',
        provider: 'VTU.ng',
      }),
    );
    expect(providerOperationRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'airtime',
        idempotencyKey: 'vtu-airtime-1',
        status: 'SUBMITTED',
        provider: 'VTU.ng',
        metadata: expect.objectContaining({
          ledgerFinalization: 'BLOCKED_UNTIL_REQUERY_OR_WEBHOOK_SUCCESS',
        }),
      }),
    );
  });

  it('verifies WhatsApp webhooks using only the backend verify token', () => {
    configService.get.mockImplementation((key: string) =>
      key === 'WHATSAPP_WEBHOOK_VERIFY_TOKEN' ? 'verify-me' : undefined,
    );

    expect(
      service.verifyWhatsAppWebhook({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'verify-me',
        'hub.challenge': 'challenge-1',
      }),
    ).toBe('challenge-1');
  });

  it('deduplicates WhatsApp webhooks in provider operations without exposing message storage as ready', async () => {
    providerOperationRepository.findOne.mockResolvedValue(null);
    providerOperationRepository.create.mockImplementation(
      (payload: any) => payload,
    );
    providerOperationRepository.save.mockImplementation(
      async (payload: any) => payload,
    );

    await expect(
      service.handleWhatsAppWebhook({ entry: [{ id: 'wa-event-1' }] }),
    ).resolves.toMatchObject({
      received: true,
      provider: 'WhatsApp Cloud API',
      duplicate: false,
      reference: 'wa-event-1',
    });
    expect(providerOperationRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'whatsapp_webhook',
        idempotencyKey: 'wa-event-1',
        provider: 'WhatsApp Cloud API',
      }),
    );
  });

  it('returns an existing bill operation without repeating a Reloadly purchase', async () => {
    const pin = await hash('1234', 4);
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      country: 'Nigeria',
      pin,
    });
    providerOperationRepository.findOne.mockResolvedValue({
      reference: 'airtime-request-1',
      status: 'SUBMITTED',
      amount: 1000,
      currency: Currency.NGN,
      provider: 'Reloadly',
      providerReference: 'reloadly-1',
      metadata: {},
    });

    await expect(
      service.purchaseService('user-1', 'airtime', {
        currency: 'NGN',
        transactionPin: '1234',
        idempotencyKey: 'airtime-request-1',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        reference: 'airtime-request-1',
        status: 'SUBMITTED',
      }),
    );
    expect(sandboxProviderService.purchaseReloadly).not.toHaveBeenCalled();
  });

  it('lists admin support tickets without exposing provider sync as a fake success', async () => {
    const supportTicketRepository = (service as any).supportTicketRepository;
    const ticket = {
      id: 'ticket-1',
      userId: 'user-1',
      category: 'Wallet',
      subject: 'Wallet issue',
      message: 'Please help',
      priority: 'NORMAL',
      status: 'OPEN',
      preferredChannel: 'email',
      resolutionSummary: null,
      metadata: { zendesk: { syncStatus: 'NOT_CONFIGURED' } },
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    };
    const queryBuilder = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[ticket], 1]),
    };
    supportTicketRepository.createQueryBuilder.mockReturnValue(queryBuilder);

    await expect(
      service.listAdminSupportTickets({ search: 'wallet', status: 'OPEN' }),
    ).resolves.toMatchObject({
      items: [
        {
          id: 'ticket-1',
          userId: 'user-1',
          category: 'Wallet',
          status: 'OPEN',
          metadata: { zendesk: { syncStatus: 'NOT_CONFIGURED' } },
        },
      ],
      meta: { total: 1, page: 1, limit: 50, pages: 1 },
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('LOWER(ticket.id)'),
      { search: '%wallet%' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'ticket.status = :status',
      {
        status: 'OPEN',
      },
    );
  });

  it('filters admin WhatsApp and VTU operation readers through stored provider operations', async () => {
    const operation = {
      id: 'op-1',
      userId: 'SYSTEM',
      type: 'whatsapp_webhook',
      idempotencyKey: 'wa-1',
      reference: 'wa-1',
      status: 'RECEIVED',
      amount: null,
      currency: null,
      provider: 'WhatsApp Cloud API',
      providerReference: 'wa-1',
      requestPayload: null,
      responsePayload: { received: true },
      errorCode: null,
      failureReason: null,
      metadata: { storage: 'provider_operation_audit_only' },
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    };
    const queryBuilder = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[operation], 1]),
    };
    providerOperationRepository.createQueryBuilder.mockReturnValue(
      queryBuilder,
    );

    await expect(
      service.listAdminWhatsAppConversations({ page: '1' }),
    ).resolves.toMatchObject({
      items: [{ id: 'op-1', operationType: 'whatsapp_webhook' }],
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'operation.type = :type',
      {
        type: 'whatsapp_webhook',
      },
    );

    queryBuilder.andWhere.mockClear();
    await expect(
      service.listAdminVtuOperations({ userId: 'user-1' }),
    ).resolves.toMatchObject({
      items: [{ id: 'op-1' }],
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('operation.type IN'),
      expect.objectContaining({
        types: ['airtime', 'data', 'utilities', 'electricity', 'tv', 'betting', 'epins', 'vtu_webhook'],
      }),
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'operation.userId = :userId',
      {
        userId: 'user-1',
      },
    );
  });
});
