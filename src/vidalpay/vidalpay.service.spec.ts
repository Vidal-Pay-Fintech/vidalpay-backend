import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash } from 'bcrypt';
import { createHmac } from 'crypto';
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
import { fincraIdentityFingerprint } from './fincra-identity';
import { UserRole } from 'src/utils/enums/user.enum';

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

const validForeignWalletActivationPayload = {
  isTermsAccepted: true,
  KYCInformation: {
    firstName: 'Ada', lastName: 'Lovelace', birthDate: '1815-12-10',
    taxCountry: 'NG', nationality: 'NG', email: 'ada@example.com',
    phone: '+2348012345678', sourceOfIncome: 'employment',
    accountDesignation: 'personal', incomeBand: { lower: '1000', upper: '5000' },
    employmentStatus: 'employed', occupation: 'Engineer',
    monthlyTransactionCount: '10', monthlyTransactionVolume: '10000',
    address: { countryOfResidence: 'NG', state: 'Lagos', zip: '100001', street: 'Test Street', number: '1', city: 'Lagos' },
    document: { type: 'passport', number: 'P12345', issuedCountryCode: 'NG', issuedBy: 'NIS', issuedDate: '2020-01-01', expirationDate: '2030-01-01' },
  },
  meansOfId: ['https://example.test/passport.jpg'],
  utilityBill: 'https://example.test/utility.pdf',
};

describe('VidalpayService', () => {
  let service: VidalpayService;
  let userRepository: ReturnType<typeof repo>;
  let walletRepository: ReturnType<typeof repo>;
  let kycProfileRepository: ReturnType<typeof repo>;
  let providerOperationRepository: ReturnType<typeof repo>;
  let transactionRepository: ReturnType<typeof repo>;
  let fincraWebhookEventRepository: ReturnType<typeof repo>;
  let rewardLedgerRepository: ReturnType<typeof repo>;
  let referralEventRepository: ReturnType<typeof repo>;
  let notificationRepository: ReturnType<typeof repo>;
  let notificationPreferenceRepository: ReturnType<typeof repo>;
  let notificationDeviceRepository: ReturnType<typeof repo>;
  let supportMessageRepository: ReturnType<typeof repo>;
  let cardRepository: ReturnType<typeof repo>;
  let fincraWalletService: {
    listBanks: jest.Mock;
    requestPermanentVirtualAccount: jest.Mock;
    generateConversionQuote: jest.Mock;
    initiateConversion: jest.Mock;
    verifyConversionStatus: jest.Mock;
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
  let yellowCardService: {
    supportedAssets: jest.Mock;
    supportedCurrencies: jest.Mock;
    rates: jest.Mock;
    quote: jest.Mock;
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
    transactionRepository = repo();
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
    supportMessageRepository = repo();
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
      listBanks: jest.fn(),
      requestPermanentVirtualAccount: jest.fn(),
      generateConversionQuote: jest.fn(),
      initiateConversion: jest.fn(),
      verifyConversionStatus: jest.fn(),
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
    yellowCardService = {
      supportedAssets: jest.fn(),
      supportedCurrencies: jest.fn(),
      rates: jest.fn(),
      quote: jest.fn(),
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
      supportMessageRepository as any,
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
      yellowCardService as any,
      configService as unknown as ConfigService,
      {} as any,
      { sendNotificationSms: jest.fn() } as any,
      {} as DataSource,
    );
  });

  describe('KYC spending policy', () => {
    const restricted = ['NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'MANUAL_REVIEW', 'RETRY_REQUIRED', 'REJECTED', 'FAILED', 'EXPIRED', 'UNSUPPORTED'];

    it.each(restricted)('blocks every spending path for %s before any side effect', async (kycStatus) => {
      userRepository.findOne.mockResolvedValue({ id: 'user-1', isVerified: true, kycStatus: 'VERIFIED' });
      kycProfileRepository.findOne.mockResolvedValue({ id: 'kyc-1', userId: 'user-1', status: kycStatus });
      const attempts = [
        () => service.internalTransfer('user-1', {}),
        () => service.externalTransfer('user-1', {}),
        () => service.purchaseService('user-1', 'airtime', {}),
        () => service.purchaseService('user-1', 'data', {}),
        () => service.purchaseService('user-1', 'utilities', {}),
        () => service.convertFx('user-1', {}),
        () => service.createCard('user-1', 'virtual', {}),
        () => service.createCardTopUpIntent('user-1', {}),
        () => service.blockCardOperation('user-1', 'card-1', 'fund', {}),
        () => service.blockLoanOperation('user-1', {}, 'repayment'),
        () => service.blockInvestmentOperation('user-1', {}, 'buy'),
      ];
      for (const attempt of attempts) {
        await expect(attempt()).rejects.toMatchObject({ status: 403, response: { code: 'KYC_REQUIRED', kycStatus } });
      }
      expect(walletRepository.save).not.toHaveBeenCalled();
      expect(providerOperationRepository.save).not.toHaveBeenCalled();
      expect(transactionRepository.save).not.toHaveBeenCalled();
      expect(sandboxProviderService.purchaseVtuNg).not.toHaveBeenCalled();
      expect(sandboxProviderService.createSudoCard).not.toHaveBeenCalled();
    });

    it('approval updates permissions and rejection removes them despite stored flags', async () => {
      userRepository.findOne.mockResolvedValue({ id: 'user-1', isVerified: true });
      const profile = { id: 'kyc-1', userId: 'user-1', region: 'NG', status: 'VERIFIED', capabilities: { canTagTransfer: false }, limits: {} };
      kycProfileRepository.findOne.mockResolvedValue(profile);
      await expect(service.getKycStatus('user-1')).resolves.toMatchObject({ status: 'VERIFIED', capabilities: { canTagTransfer: true, canBankTransfer: true } });
      profile.status = 'REJECTED';
      profile.capabilities.canTagTransfer = true;
      await expect(service.getKycStatus('user-1')).resolves.toMatchObject({ status: 'REJECTED', capabilities: { canTagTransfer: false, canBankTransfer: false } });
    });

    it('reports government ID presence while continuing to mask BVN values', async () => {
      userRepository.findOne.mockResolvedValue({ id: 'user-1', countryCode: 'NG' });
      kycProfileRepository.findOne.mockResolvedValue({
        id: 'kyc-1', userId: 'user-1', region: 'NG', status: 'VERIFIED',
        identity: { nin: '12345678901', bvn: '10987654321' },
      });

      await expect(service.getKycStatus('user-1')).resolves.toMatchObject({
        identity: { ninProvided: true, bvnProvided: true },
      });
      const response = await service.getKycStatus('user-1');
      expect(response.identity).not.toHaveProperty('bvn');
    });

    it('reports missing government ID values as not provided', async () => {
      userRepository.findOne.mockResolvedValue({ id: 'user-1', countryCode: 'NG' });
      kycProfileRepository.findOne.mockResolvedValue({
        id: 'kyc-1', userId: 'user-1', region: 'NG', status: 'VERIFIED', identity: {},
      });

      await expect(service.getKycStatus('user-1')).resolves.toMatchObject({
        identity: { ninProvided: false, bvnProvided: false },
      });
    });

    it('a verified account does not restart or downgrade from client submissions', async () => {
      userRepository.findOne.mockResolvedValue({ id: 'user-1', kycStatus: 'VERIFIED' });
      kycProfileRepository.findOne.mockResolvedValue({ id: 'kyc-1', userId: 'user-1', status: 'VERIFIED', region: 'US' });
      await expect(service.startKyc('user-1')).resolves.toMatchObject({ mode: 'STATUS_ONLY', status: 'VERIFIED' });
      await expect(service.submitKycProfile('user-1', {})).resolves.toMatchObject({ status: 'VERIFIED' });
      expect(kycProfileRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('Fincra, MetaMap and final review journey', () => {
    const customer = { id: 'user-1', countryCode: 'NG', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-01-02' };
    const fincraEvidence = () => ({ status: 'VERIFIED', metadata: { identityMatched: true, identityFingerprint: fincraIdentityFingerprint(customer), environment: 'sandbox' } });
    const metamapEvidence = () => ({ status: 'APPLIED', providerReference: 'verification-1', metadata: { providerStatus: 'VERIFIED' } });

    beforeEach(() => {
      userRepository.findOne.mockImplementation(async ({ where }) => where.id === 'admin-1'
        ? { id: 'admin-1', role: UserRole.SUPER_ADMIN } : { ...customer });
      kycProfileRepository.findOne.mockResolvedValue({ id: 'kyc-1', userId: customer.id, region: 'NG', status: 'MANUAL_REVIEW', providerReference: 'verification-1', updatedAt: new Date(), identity: {} });
      kycProfileRepository.update.mockResolvedValue({ affected: 1 });
      providerOperationRepository.findOne.mockImplementation(async ({ where }) => where.type === 'kyc_webhook' ? metamapEvidence() : fincraEvidence());
      notificationPreferenceRepository.findOne.mockResolvedValue({ preferences: { push: false } });
      notificationDeviceRepository.find.mockResolvedValue([]);
      notificationRepository.find.mockResolvedValue([]);
    });

    it('rejects non-super-admin approval before changing any state', async () => {
      userRepository.findOne.mockResolvedValue({ id: 'admin-1', role: UserRole.ADMIN });
      await expect(service.reviewKyc('admin-1', 'user-1', 'VERIFIED')).rejects.toMatchObject({ status: 403 });
      expect(kycProfileRepository.update).not.toHaveBeenCalled();
    });

    it.each([null, { status: 'FAILED' }, { status: 'VERIFIED', metadata: { ...fincraEvidence().metadata, environment: 'live' } },
      { status: 'VERIFIED', metadata: { ...fincraEvidence().metadata, identityFingerprint: 'outdated' } },
    ])('refuses final approval without matching Fincra evidence', async (evidence) => {
      providerOperationRepository.findOne.mockImplementation(async ({ where }) => where.type === 'kyc_webhook' ? metamapEvidence() : evidence);
      await expect(service.reviewKyc('admin-1', 'user-1', 'VERIFIED')).rejects.toMatchObject({ response: { code: 'FINCRA_KYC_CHECK_REQUIRED' } });
      expect(kycProfileRepository.update).not.toHaveBeenCalled();
    });

    it('requires persistent MetaMap evidence and cannot use client identity flags as approval', async () => {
      providerOperationRepository.findOne.mockResolvedValue(null);
      await service.submitKycProfile('user-1', { identity: { fincra: { status: 'VERIFIED' }, metamapSessionId: 'fake', actionRequired: { reviewedBy: 'admin-1' }, status: 'VERIFIED' } });
      expect(kycProfileRepository.save).toHaveBeenCalledWith(expect.objectContaining({ identity: {} }));
      const profile = await kycProfileRepository.findOne({});
      profile.status = 'MANUAL_REVIEW';
      await expect(service.reviewKyc('admin-1', 'user-1', 'VERIFIED')).rejects.toMatchObject({ response: { code: 'KYC_PROVIDER_CHECK_REQUIRED' } });
    });

    it('does not overwrite a provider decision that changed during admin review', async () => {
      kycProfileRepository.update.mockResolvedValue({ affected: 0 });
      await expect(service.reviewKyc('admin-1', 'user-1', 'VERIFIED')).rejects.toMatchObject({ status: 412 });
      expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('requests NGN wallet provisioning after final Nigerian KYC approval', async () => {
      kycProfileRepository.findOne.mockResolvedValue({
        id: 'kyc-1', userId: customer.id, region: 'NG', status: 'MANUAL_REVIEW',
        providerReference: 'verification-1', updatedAt: new Date(),
        identity: { bvn: '12345678901' },
      });
      const activation = jest
        .spyOn(service, 'activateWalletProduct')
        .mockResolvedValue({ status: 'PENDING' } as any);

      const result = await service.reviewKyc('admin-1', customer.id, 'VERIFIED');

      expect(activation).toHaveBeenCalledWith(customer.id, Currency.NGN, {
        KYCInformation: { bvn: '12345678901' },
      });
      expect(result.ngnWalletActivation).toMatchObject({ status: 'PENDING' });
    });

    it('runs the Nigerian stage sequence with mocked provider responses and a signed webhook', async () => {
      const profile = { id: 'kyc-1', userId: customer.id, region: 'NG', status: 'NOT_STARTED', provider: null, providerReference: null, identity: {}, sections: [], updatedAt: new Date() };
      const operations: any[] = [];
      kycProfileRepository.findOne.mockResolvedValue(profile);
      providerOperationRepository.findOne.mockImplementation(async ({ where }) => operations.slice().reverse().find((operation) => Object.entries(where).every(([key, value]) => operation[key] === value)) ?? null);
      providerOperationRepository.save.mockImplementation(async (operation) => { if (!operations.includes(operation)) operations.push(operation); return operation; });
      configService.get.mockImplementation((key) => ({ FINCRA_KYC_ENABLED: 'true', FINCRA_API_KEY: 'test-key', FINCRA_BUSINESS_ID: 'business-1', METAMAP_CLIENT_ID: 'client', METAMAP_WORKFLOW_ID: 'workflow', METAMAP_WEBHOOK_SECRET: 'webhook-secret' })[key]);
      sandboxProviderService.verifyFincraBvn.mockResolvedValue({ success: true, data: { verificationStatus: 'verified', response: { firstName: 'JANE', lastName: 'DOE', dateOfBirth: '02-Jan-1990' } } });

      await expect(service.startKyc(customer.id)).resolves.toMatchObject({ provider: 'FINCRA', mode: 'BACKEND_VERIFICATION' });
      await service.submitKycSection(customer.id, 'GOVERNMENT_ID', { bvn: '22222222222' });
      expect(profile.status).toBe('IN_PROGRESS');
      const config = await service.startKyc(customer.id);
      expect(config.provider).toBe('METAMAP');
      const payload = { eventId: 'final-event', verificationId: 'verification-1', status: 'verified', metadata: (config as any).metadata };
      const signature = createHmac('sha256', 'webhook-secret').update(JSON.stringify(payload)).digest('hex');
      await expect(service.handleKycWebhook(payload, signature)).resolves.toMatchObject({ status: 'MANUAL_REVIEW' });
      await expect(service.internalTransfer(customer.id, {})).rejects.toMatchObject({ response: { code: 'KYC_REQUIRED' } });
      await expect(service.reviewKyc('admin-1', customer.id, 'VERIFIED')).resolves.toMatchObject({ kyc: { status: 'VERIFIED' } });
      expect(kycProfileRepository.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'MANUAL_REVIEW' }), expect.objectContaining({ status: 'VERIFIED' }));
    });
  });

  describe('KYC webhook decisions', () => {
    const secret = 'test-webhook-secret';
    const signature = (payload: object) => createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');

    beforeEach(() => {
      configService.get.mockImplementation((key: string) => key === 'METAMAP_WEBHOOK_SECRET' ? secret : undefined);
      notificationDeviceRepository.find.mockResolvedValue([]);
      userRepository.findOne.mockResolvedValue({ id: 'user-1', kycStatus: 'IN_PROGRESS' });
      kycProfileRepository.findOne.mockResolvedValue({ id: 'kyc-1', userId: 'user-1', status: 'IN_PROGRESS', region: 'NG', provider: 'METAMAP', identity: { metamapSessionId: 'session-1' } });
      const events = new Map();
      providerOperationRepository.findOne.mockImplementation(async ({ where }) => events.get(where.idempotencyKey) ?? null);
      providerOperationRepository.save.mockImplementation(async (operation) => { events.set(operation.idempotencyKey, operation); return operation; });
    });

    it('requires final review after progress events with the same verification id', async () => {
      const base = { verificationId: 'verification-1', metadata: { userId: 'user-1', metamapSessionId: 'session-1' } };
      const started = { ...base, eventName: 'verification_started' };
      const completed = { ...base, eventName: 'verification_completed', status: 'verified' };
      await service.handleKycWebhook(started, signature(started));
      await expect(service.handleKycWebhook(completed, signature(completed))).resolves.toMatchObject({ updated: true, status: 'MANUAL_REVIEW' });
      await expect(service.handleKycWebhook(completed, signature(completed))).resolves.toMatchObject({ duplicate: true });
    });

    it('uses updated identityStatus to revoke a previous approval', async () => {
      const payload = { eventName: 'verification_updated', verificationId: 'verification-1', userId: 'user-1', metadata: { metamapSessionId: 'session-1' }, status: 'verified', identityStatus: 'rejected' };
      await expect(service.handleKycWebhook(payload, signature(payload))).resolves.toMatchObject({ status: 'REJECTED' });
      await expect(service.internalTransfer('user-1', {})).rejects.toMatchObject({ response: { code: 'KYC_REQUIRED' } });
    });

    it('does not mistake SDK completion or a step result for identity approval', async () => {
      for (const payload of [
        { userId: 'user-1', eventName: 'verification_inputs_completed' },
        { userId: 'user-1', eventName: 'step_completed', status: 'verified' },
        { userId: 'user-1', eventName: 'verification_completed' },
      ]) {
        const result = await service.handleKycWebhook(payload, signature(payload));
        expect(result).not.toMatchObject({ status: 'VERIFIED' });
      }
    });

    it('rejects missing, invalid, and unconfigured webhook signatures', async () => {
      const payload = { userId: 'user-1', status: 'verified' };
      await expect(service.handleKycWebhook(payload)).rejects.toMatchObject({ status: 401 });
      await expect(service.handleKycWebhook(payload, 'invalid')).rejects.toMatchObject({ status: 401 });
      configService.get.mockReturnValue(undefined);
      await expect(service.handleKycWebhook(payload)).rejects.toMatchObject({ response: { code: 'KYC_WEBHOOK_NOT_CONFIGURED' } });
      expect(userRepository.update).not.toHaveBeenCalled();
    });

    it.each([undefined, 'another-session'])('does not apply a signed event from an unbound session (%s)', async (metamapSessionId) => {
      const payload = { verificationId: 'verification-1', status: 'verified', metadata: { userId: 'user-1', metamapSessionId } };
      await expect(service.handleKycWebhook(payload, signature(payload))).resolves.toMatchObject({ updated: false });
      expect(kycProfileRepository.save).not.toHaveBeenCalled();
    });
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
          provider: 'FINCRA',
          providerStatus: 'NOT_PROVISIONED',
          balance: 0,
        }),
        expect.objectContaining({
          currency: Currency.USD,
          provider: 'FINCRA',
          providerStatus: 'NOT_PROVISIONED',
          balance: 0,
        }),
      ]),
    );
    expect(result.wallets.map((wallet) => wallet.currency)).toEqual([
      Currency.NGN,
      Currency.USD,
    ]);
  });

  it('returns the live Fincra NGN bank catalog for withdrawal selection', async () => {
    providerStatusService.getStatus.mockReturnValue(status({
      provider: 'Fincra',
      capability: 'ngn_wallet',
      enabled: true,
      envConfigured: true,
      missingEnvVars: [],
      readinessStatus: 'CONFIGURED_NOT_LIVE_TESTED',
    }) as any);
    fincraWalletService.listBanks.mockResolvedValue({
      success: true,
      data: [{ id: 'bank-1', code: '044', name: 'Access Bank', nibssCode: '044' }],
    });

    await expect(service.getBankCatalog()).resolves.toMatchObject({
      provider: 'Fincra',
      source: 'FINCRA_LIVE_RESPONSE',
      banks: [{ id: 'bank-1', code: '044', name: 'Access Bank', currency: 'NGN' }],
    });
    expect(fincraWalletService.listBanks).toHaveBeenCalledWith('NG', 'NGN');
  });

  it.each([['Nigeria', 'NG'], ['United States', 'US']])(
    'saves KYC residence for %s without attempting unrelated wallet creation',
    async (country, countryCode) => {
      const user = { id: 'user-1', tagId: '$EXISTING', country: null, countryCode: null, region: null };
      const kyc = { id: 'kyc-1', userId: user.id, status: 'NOT_STARTED', region: null, identity: {}, sections: [], limits: {} };
      userRepository.findOne.mockResolvedValue(user);
      userRepository.update.mockImplementation(async (_id, patch) => Object.assign(user, patch));
      kycProfileRepository.findOne.mockResolvedValue(kyc);
      walletRepository.find.mockResolvedValue([]);
      walletRepository.save.mockRejectedValue(Object.assign(
        new Error('column "address" of relation "wallet" does not exist'), { code: '42703' },
      ));

      await expect(service.updateProfile(user.id, { country, countryCode })).resolves.toMatchObject({
        region: countryCode,
        kycStatus: 'NOT_STARTED',
        wallet: [],
        capabilities: { canTagTransfer: false, canBankTransfer: false },
      });
      expect(userRepository.update).toHaveBeenCalledWith(user.id, { country, countryCode, region: countryCode });
      expect(kycProfileRepository.save).toHaveBeenCalledWith(expect.objectContaining({ region: countryCode }));
      expect(walletRepository.create).not.toHaveBeenCalled();
      expect(walletRepository.save).not.toHaveBeenCalled();
      expect(fincraWalletService.requestPermanentVirtualAccount).not.toHaveBeenCalled();
    },
  );

  it('preserves existing balances and provider records when adding unprovisioned Fincra wallet records', async () => {
    const wallets = [
      { id: 'ngn-1', currency: Currency.NGN, balance: 1234, provider: 'PayVessel', accountNumber: 'legacy-ngn' },
      { id: 'usd-1', currency: Currency.USD, balance: 567, provider: 'Unit.co', accountNumber: 'legacy-usd' },
    ];
    const before = JSON.stringify(wallets);
    walletRepository.find.mockResolvedValue(wallets);
    await service.ensureCustomerWallets('user-1');
    expect(walletRepository.save).toHaveBeenCalledWith([
      { userId: 'user-1', currency: Currency.GBP, balance: 0, provider: 'FINCRA', providerStatus: 'NOT_PROVISIONED' },
      { userId: 'user-1', currency: Currency.CAD, balance: 0, provider: 'FINCRA', providerStatus: 'NOT_PROVISIONED' },
    ]);
    expect(JSON.stringify(wallets)).toBe(before);
    expect(walletRepository.update).not.toHaveBeenCalled();
    expect(fincraWalletService.requestPermanentVirtualAccount).not.toHaveBeenCalled();
  });

  it('does not invent a provider based only on wallet currency', async () => {
    userRepository.findOne.mockResolvedValue({ id: 'user-1', tagId: '$EXISTING', countryCode: 'NG' });
    walletRepository.find.mockResolvedValue([{ id: 'ngn-1', currency: Currency.NGN, balance: 50 }]);
    kycProfileRepository.findOne.mockResolvedValue({ id: 'kyc-1', status: 'NOT_STARTED', region: 'NG' });
    await expect(service.getCurrentUser('user-1')).resolves.toMatchObject({
      wallet: [expect.objectContaining({ balance: 50, provider: null, providerStatus: 'NOT_PROVISIONED' })],
    });
    expect(walletRepository.save).not.toHaveBeenCalled();
  });

  it('does not disguise a failed wallet read as an empty account', async () => {
    userRepository.findOne.mockResolvedValue({ id: 'user-1', tagId: '$EXISTING' });
    kycProfileRepository.findOne.mockResolvedValue({ id: 'kyc-1', status: 'NOT_STARTED' });
    const error = Object.assign(new Error('database connection lost'), { code: '08006' });
    walletRepository.find.mockRejectedValue(error);
    await expect(service.getCurrentUser('user-1')).rejects.toBe(error);
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

  it('does not bypass Fincra checks when KYC profile storage is absent', async () => {
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

    await expect(service.startKyc('legacy-user')).rejects.toMatchObject({ response: { code: 'FINCRA_KYC_CHECK_REQUIRED' } });
    expect(userRepository.update).not.toHaveBeenCalled();
    expect(kycProfileRepository.save).not.toHaveBeenCalled();
  });

  it('starts Fincra KYC first and requires MetaMap as the next provider', async () => {
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
        nextProvider: 'METAMAP',
        requirements: expect.arrayContaining(['bvn', 'government_id']),
        metadata: expect.objectContaining({ provider: 'FINCRA' }),
      }),
    );
  });

  it('submits BVN verification through Fincra without storing the raw BVN in provider operations', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-01-02',
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
    walletRepository.findOne.mockResolvedValue({
      id: 'wallet-ngn-1',
      userId: 'user-1',
      currency: Currency.NGN,
      balance: 5000,
    });
    walletRepository.save.mockImplementation(async (payload: any) => payload);
    transactionRepository.create.mockImplementation((payload: any) => payload);
    transactionRepository.save.mockImplementation(async (payload: any) => payload);
    sandboxProviderService.verifyFincraBvn.mockResolvedValue({
      success: true,
      data: { id: 'verify-1', verificationStatus: 'verified', response: { firstName: 'JANE', lastName: 'DOE', dateOfBirth: '02-Jan-1990' } },
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

  it('returns read-only Fincra rates and indicative FX quotes without an amount', async () => {
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
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        executable: false,
        status: 'QUOTE_ONLY',
        estimatedAmount: 0,
      }),
    );
  });

  it('parses the documented Fincra price field and exposes the source environment', async () => {
    userRepository.findOne.mockResolvedValue({ id: 'user-1' });
    configService.get.mockImplementation((key) => key === 'FINCRA_API_KEY' ? 'test-key' : undefined);
    sandboxProviderService.getFincraRates.mockResolvedValue({ success: true, data: { rates: [
      { baseCurrency: 'USD', quoteCurrency: 'NGN', side: 'sell', price: 1500 },
      { baseCurrency: 'CAD', quoteCurrency: 'NGN', price: 0 },
    ] } });
    await expect(service.getFxRates('user-1')).resolves.toMatchObject({ status: 'AVAILABLE', environment: 'sandbox', rates: [{ fromCurrency: 'USD', toCurrency: 'NGN', rate: 1500, side: 'sell' }] });
    sandboxProviderService.getFincraRates.mockResolvedValue({ data: { rates: [] } });
    await expect(service.getFxRates('user-1')).resolves.toMatchObject({ status: 'UNAVAILABLE', rates: [] });
  });

  it('does not bypass Fincra checks when KYC profile columns are missing', async () => {
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

    await expect(service.startKyc('legacy-user')).rejects.toMatchObject({ response: { code: 'FINCRA_KYC_CHECK_REQUIRED' } });
    expect(kycProfileRepository.save).not.toHaveBeenCalled();
  });

  it('refuses to start verification when saving the KYC profile hits a schema gap', async () => {
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
          FINCRA_KYC_ENABLED: 'true', FINCRA_API_KEY: 'key', FINCRA_BUSINESS_ID: 'business',
          METAMAP_CLIENT_ID: 'metamap-client',
          METAMAP_WORKFLOW_ID: 'metamap-workflow',
        })[key],
    );

    await expect(service.startKyc('legacy-user')).rejects.toMatchObject({ response: { code: 'KYC_STORAGE_UNAVAILABLE' } });
  });

  it('does not bypass Fincra checks when Postgres reports a missing KYC table', async () => {
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

    await expect(service.startKyc('legacy-user')).rejects.toMatchObject({ response: { code: 'FINCRA_KYC_CHECK_REQUIRED' } });
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
    userRepository.findOne.mockResolvedValue({ id: 'user-1', kycStatus: 'VERIFIED' });
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

  it.each([
    ['CA', Currency.CAD],
    ['GB', Currency.GBP],
  ])('orders a %s user default wallet first', async (countryCode, expectedCurrency) => {
    userRepository.findOne.mockResolvedValue({ id: 'user-1', countryCode });
    walletRepository.find.mockResolvedValue([
      { id: 'usd-wallet', userId: 'user-1', currency: Currency.USD, balance: 0 },
      { id: 'cad-wallet', userId: 'user-1', currency: Currency.CAD, balance: 0 },
      { id: 'gbp-wallet', userId: 'user-1', currency: Currency.GBP, balance: 0 },
      { id: 'ngn-wallet', userId: 'user-1', currency: Currency.NGN, balance: 0 },
    ]);

    const result = await service.getWallets('user-1');

    expect(result.wallets[0].currency).toBe(expectedCurrency);
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
    expect(response.accountDetails.message).toContain('USD');
    expect(response.accountDetails.message).not.toMatch(/Unit|PayVessel/);
  });

  it('persists blocked provider operations and returns structured unavailable errors', async () => {
    userRepository.findOne.mockResolvedValue({ id: 'user-1', kycStatus: 'VERIFIED' });
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

  it('returns Yellow Card assets and currencies without creating crypto wallets', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      countryCode: 'US',
      region: 'US',
    });
    providerStatusService.getStatus.mockImplementation((capability: any) =>
      status({
        capability,
        provider: 'Yellow Card',
        enabled: true,
        envConfigured: true,
        missingEnvVars: [],
      }),
    );
    yellowCardService.supportedAssets.mockResolvedValue({
      data: [
        {
          asset: 'USDT',
          network: 'TRC20',
          token: 'must-not-return',
        },
      ],
    });
    yellowCardService.supportedCurrencies.mockResolvedValue({
      data: [{ currency: 'NGN', name: 'Nigerian Naira' }],
    });

    await expect(service.cryptoAssets('user-1')).resolves.toEqual(
      expect.objectContaining({
        provider: 'Yellow Card',
        configured: true,
        executionEnabled: false,
        assets: [expect.objectContaining({ asset: 'USDT', network: 'TRC20' })],
        currencies: [expect.objectContaining({ currency: 'NGN' })],
      }),
    );
    expect(walletRepository.save).not.toHaveBeenCalled();
    expect(transactionRepository.save).not.toHaveBeenCalled();
  });

  it('returns a Yellow Card quote as non-executable and does not debit wallets', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      countryCode: 'US',
      region: 'US',
    });
    providerStatusService.getStatus.mockImplementation((capability: any) =>
      status({
        capability,
        provider: 'Yellow Card',
        enabled: true,
        envConfigured: true,
        missingEnvVars: [],
      }),
    );
    yellowCardService.quote.mockResolvedValue({
      id: 'quote-1',
      sourceCurrency: 'NGN',
      destinationCurrency: 'USDT',
      rate: '1500',
      secret: 'must-not-return',
    });

    await expect(
      service.cryptoQuote('user-1', {
        sourceCurrency: 'NGN',
        destinationCurrency: 'USDT',
        amount: 10000,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        provider: 'Yellow Card',
        configured: true,
        executable: false,
        quoteOnly: true,
        quote: expect.objectContaining({
          id: 'quote-1',
          sourceCurrency: 'NGN',
          destinationCurrency: 'USDT',
        }),
      }),
    );
    expect(walletRepository.update).not.toHaveBeenCalled();
    expect(transactionRepository.save).not.toHaveBeenCalled();
    expect(providerOperationRepository.save).not.toHaveBeenCalled();
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
    configService.get.mockImplementation((key: string) =>
      ['USD', 'GBP'].some((currency) => key === `FINCRA_${currency}_SUPPORTED_JURISDICTIONS`)
        ? 'NG'
        : undefined,
    );
    userRepository.findOne.mockResolvedValue({ id: 'user-1', region: 'NG' });
    walletRepository.find.mockResolvedValue([
      {
        id: 'ngn-wallet',
        userId: 'user-1',
        currency: Currency.NGN,
        balance: 0,
        provider: 'FINCRA',
        providerStatus: 'ACTIVE',
        accountNumber: '1234567890',
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
    configService.get.mockImplementation((key: string) =>
      key === 'FINCRA_GBP_SUPPORTED_JURISDICTIONS' ? 'NG' : undefined,
    );
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

    const result = await service.getWalletEligibility('user-1', 'EUR');

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

  it('does not treat an unprovisioned currency placeholder as an active wallet', async () => {
    userRepository.findOne.mockResolvedValue({ id: 'user-1', region: 'NG' });
    walletRepository.find.mockResolvedValue([
      {
        id: 'gbp-placeholder',
        userId: 'user-1',
        currency: 'GBP',
        balance: 0,
        provider: 'FINCRA',
        providerStatus: 'NOT_PROVISIONED',
        accountNumber: null,
      },
    ]);
    providerOperationRepository.findOne.mockResolvedValue(null);
    kycProfileRepository.findOne.mockResolvedValue({ status: 'VERIFIED' });

    const result = await service.getWalletEligibility('user-1', 'GBP');

    expect(result.status).not.toBe('ACTIVE');
    expect(result.activeWallet).toBeNull();
  });

  it('requires final KYC approval before requesting a Fincra wallet', async () => {
    configService.get.mockImplementation((key: string) =>
      key === 'FINCRA_GBP_SUPPORTED_JURISDICTIONS' ? 'NG' : undefined,
    );
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      region: 'NG',
      kycStatus: 'MANUAL_REVIEW',
    });
    walletRepository.find.mockResolvedValue([]);
    kycProfileRepository.findOne.mockResolvedValue({ status: 'MANUAL_REVIEW' });

    const eligibility = await service.getWalletEligibility('user-1', 'GBP');
    expect(eligibility.status).toBe('KYC_REQUIRED');
    expect(eligibility.canRequest).toBe(false);
    expect(eligibility.missingRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'VIDALPAY_FINAL_KYC_APPROVAL' }),
      ]),
    );

    await expect(
      service.activateWalletProduct('user-1', 'GBP', {}),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'KYC_REQUIRED' }),
    });
    expect(fincraWalletService.requestPermanentVirtualAccount).not.toHaveBeenCalled();
  });

  it('does not recreate an already-active wallet', async () => {
    configService.get.mockImplementation((key: string) =>
      key === 'FINCRA_GBP_SUPPORTED_JURISDICTIONS' ? 'NG' : undefined,
    );
    userRepository.findOne.mockResolvedValue({ id: 'user-1', region: 'NG' });
    walletRepository.find.mockResolvedValue([
      {
        id: 'gbp-wallet',
        userId: 'user-1',
        currency: 'GBP',
        balance: 0,
        provider: 'FINCRA',
        providerStatus: 'ACTIVE',
        accountNumber: '1234567890',
      },
    ]);
    providerOperationRepository.findOne.mockResolvedValue(null);
    kycProfileRepository.findOne.mockResolvedValue({ status: 'VERIFIED' });

    const result = await service.activateWalletProduct('user-1', 'GBP', {});

    expect(result.activation.status).toBe('ALREADY_ACTIVE');
    expect(walletRepository.save).not.toHaveBeenCalled();
  });

  it('does not create duplicate activation when one is pending', async () => {
    configService.get.mockImplementation((key: string) =>
      key === 'FINCRA_GBP_SUPPORTED_JURISDICTIONS' ? 'NG' : undefined,
    );
    userRepository.findOne.mockResolvedValue({ id: 'user-1', region: 'NG' });
    walletRepository.find.mockResolvedValue([]);
    providerOperationRepository.findOne.mockResolvedValue({
      id: 'op-1',
      reference: 'op-1',
      status: 'PENDING',
      currency: 'GBP',
      provider: 'FINCRA',
    });
    kycProfileRepository.findOne.mockResolvedValue({ status: 'VERIFIED' });

    const result = await service.activateWalletProduct('user-1', 'GBP', {});

    expect(result.activation.status).toBe('PENDING');
    expect(providerOperationRepository.save).not.toHaveBeenCalled();
  });

  it('returns honest provider-not-configured activation state without creating a fake account', async () => {
    configService.get.mockImplementation((key: string) =>
      key === 'FINCRA_GBP_SUPPORTED_JURISDICTIONS' ? 'NG' : undefined,
    );
    userRepository.findOne.mockResolvedValue({ id: 'user-1', region: 'NG' });
    walletRepository.find.mockResolvedValue([]);
    providerOperationRepository.findOne.mockResolvedValue(null);
    kycProfileRepository.findOne.mockResolvedValue({ status: 'VERIFIED' });

    const result = await service.activateWalletProduct('user-1', 'GBP', {});

    expect(result.status).toBe('REQUIRES_INFORMATION');
    expect(result.activation.status).toBe('REQUIRES_INFORMATION');
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
      if (key === 'FINCRA_GBP_SANDBOX_VA_SUPPORT') return 'true';
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
    kycProfileRepository.findOne.mockResolvedValue({ status: 'VERIFIED' });
    fincraWalletService.requestPermanentVirtualAccount.mockResolvedValue({
      status: 200,
      data: {
        success: true,
        data: {
          id: 'fincra-request-1',
          status: 'active',
          accountInformation: {
            accountNumber: '9876543210',
            accountName: 'Ada Lovelace',
          },
        },
      },
      providerReference: 'fincra-request-1',
      requestStatus: 'PENDING',
    });

    const result = await service.activateWalletProduct(
      'user-1', 'GBP', validForeignWalletActivationPayload,
    );

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
    expect(result.activation.message).toContain('webhook');
  });

  it('sends NGN BVN to Fincra without persisting the raw value in provider operation storage', async () => {
    (configService.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'FINCRA_WALLET_PRODUCTS_JSON') {
        return JSON.stringify([
          {
            currency: 'NGN',
            enabled: true,
            tier: 'PRIMARY',
            supportedJurisdictions: ['NG'],
            canProvision: true,
            requirementsConfigured: true,
            requirements: [],
          },
        ]);
      }
      if (key === 'FINCRA_API_KEY') return 'configured';
      if (key === 'FINCRA_BASE_URL') return 'https://sandboxapi.fincra.com';
      if (key === 'FINCRA_NGN_SANDBOX_VA_SUPPORT') return 'true';
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
    });
    walletRepository.find.mockResolvedValue([]);
    providerOperationRepository.findOne.mockResolvedValue(null);
    providerOperationRepository.create.mockImplementation((value: any) => value);
    providerOperationRepository.save.mockImplementation(async (value: any) => value);
    kycProfileRepository.findOne.mockResolvedValue({ status: 'VERIFIED' });
    fincraWalletService.requestPermanentVirtualAccount.mockResolvedValue({
      status: 200,
      data: { success: true, data: { status: 'approved', accountNumber: null } },
      providerReference: 'fincra-ngn-request',
      requestStatus: 'APPROVED',
    });

    const result = await service.activateWalletProduct('user-1', 'NGN', {
      KYCInformation: { bvn: '12345678901' },
    });

    expect(fincraWalletService.requestPermanentVirtualAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: 'NGN',
        KYCInformation: expect.objectContaining({ bvn: '12345678901' }),
      }),
    );
    expect(providerOperationRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'PENDING',
        requestPayload: expect.not.objectContaining({
          KYCInformation: expect.objectContaining({ bvn: '12345678901' }),
        }),
      }),
    );
    expect(walletRepository.save).not.toHaveBeenCalled();
    expect(result.status).toBe('PENDING');
  });

  it('rejects NGN activation before provider submission when BVN is missing', async () => {
    configService.get.mockImplementation((key: string) =>
      key === 'FINCRA_NGN_SUPPORTED_JURISDICTIONS' ? 'NG' : undefined,
    );
    userRepository.findOne.mockResolvedValue({
      id: 'user-1', region: 'NG', firstName: 'Ada', lastName: 'Lovelace',
    });
    walletRepository.find.mockResolvedValue([]);
    providerOperationRepository.findOne.mockResolvedValue(null);
    kycProfileRepository.findOne.mockResolvedValue({ status: 'VERIFIED' });

    const result = await service.activateWalletProduct('user-1', 'NGN', {});

    expect(result.status).toBe('REQUIRES_INFORMATION');
    expect(result.missingRequirements).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'bvn' })]),
    );
    expect(fincraWalletService.requestPermanentVirtualAccount).not.toHaveBeenCalled();
    expect(providerOperationRepository.save).not.toHaveBeenCalled();
  });

  it('does not expose legacy account details unless the wallet is Fincra-issued and active', async () => {
    walletRepository.find.mockResolvedValue([]);
    walletRepository.findOne.mockResolvedValue({
      id: 'old-wallet',
      userId: 'user-1',
      currency: Currency.NGN,
      balance: 0,
      provider: 'LEGACY',
      providerStatus: 'ACTIVE',
      accountNumber: '0112233445',
      accountName: 'Legacy Name',
      bankName: 'Legacy Bank',
    });

    const response = await service.getWalletAccountDetails('user-1', Currency.NGN);

    expect(response.accountDetails).toEqual(
      expect.objectContaining({
        accountNumber: null,
        accountName: null,
        bankName: null,
        isProvisioned: false,
      }),
    );
    expect(response.wallet.accountNumber).toBeNull();
  });

  it('does not persist an approved webhook before Fincra issues the account', async () => {
    const payload = {
      id: 'event-approved',
      event: 'virtualaccount.approved',
      data: {
        id: 'fincra-request-1',
        status: 'approved',
        accountInformation: { accountNumber: '1234567890' },
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
      reference: 'wallet_activation:user-1:CAD',
      providerReference: 'fincra-request-1',
      status: 'PENDING',
      currency: 'CAD',
      metadata: {},
    });
    providerOperationRepository.save.mockImplementation(
      async (payload: any) => payload,
    );

    const result = await service.handleFincraWebhook(payload, signature);

    expect(result.walletUpdated).toBe(false);
    expect(walletRepository.save).not.toHaveBeenCalled();
    expect(providerOperationRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'APPROVED' }),
    );
  });

  it('keeps a conversion pending until the provider reports a terminal result', async () => {
    const operation = {
      id: 'operation-1',
      userId: 'user-1',
      type: 'fx_convert',
      reference: 'fx-reference-1',
      status: 'PENDING',
      amount: 100,
      currency: 'NGN',
      providerReference: 'provider-conversion-1',
      metadata: { settlement: 'RECONCILIATION_REQUIRED' },
    };
    providerOperationRepository.findOne.mockResolvedValue(operation);
    fincraWalletService.verifyConversionStatus.mockResolvedValue({
      data: { reference: 'provider-conversion-1', status: 'processing' },
    });

    await expect(
      service.getFxConversionStatus('user-1', 'fx-reference-1'),
    ).resolves.toEqual(expect.objectContaining({ status: 'PENDING' }));
    expect(fincraWalletService.verifyConversionStatus).toHaveBeenCalledWith(
      'provider-conversion-1',
    );
  });

  it('accepts the NGN virtualaccount.approved webhook as Fincra issuance confirmation', async () => {
    const payload = {
      id: 'event-ngn-approved',
      event: 'virtualaccount.approved',
      data: {
        id: 'fincra-ngn-request',
        currency: 'NGN',
        status: 'approved',
        accountInformation: {
          accountNumber: '0123456789',
          accountName: 'Ada Lovelace',
          bankName: 'Wema Bank',
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
      id: 'op-ngn',
      userId: 'user-1',
      type: 'wallet_activation',
      reference: 'wallet_activation:user-1:NGN',
      providerReference: 'fincra-ngn-request',
      status: 'PENDING',
      currency: 'NGN',
      metadata: {},
    });
    providerOperationRepository.save.mockImplementation(
      async (operation: any) => operation,
    );

    const result = await service.handleFincraWebhook(payload, signature);

    expect(result.walletUpdated).toBe(true);
    expect(walletRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: Currency.NGN,
        accountNumber: '0123456789',
        provider: 'FINCRA',
        providerStatus: 'ACTIVE',
      }),
    );
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
      if (key === 'FINCRA_CAD_SANDBOX_VA_SUPPORT') return 'true';
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
    walletRepository.findOne.mockResolvedValue({
      id: 'wallet-ngn-1',
      userId: 'user-1',
      currency: Currency.NGN,
      balance: 5000,
    });
    walletRepository.save.mockImplementation(async (payload: any) => payload);
    transactionRepository.create.mockImplementation((payload: any) => payload);
    transactionRepository.save.mockImplementation(async (payload: any) => payload);
    kycProfileRepository.findOne.mockResolvedValue({ status: 'VERIFIED' });
    fincraWalletService.requestPermanentVirtualAccount.mockRejectedValue({
      response: {
        message: {
          code: 'FINCRA_REQUEST_TIMEOUT',
          message: 'Fincra request timed out.',
          retryable: true,
        },
      },
    });

    const result = await service.activateWalletProduct(
      'user-1', 'CAD', validForeignWalletActivationPayload,
    );

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
      if (key === 'FINCRA_CAD_SANDBOX_VA_SUPPORT') return 'true';
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
    walletRepository.findOne.mockResolvedValue({
      id: 'wallet-ngn-1',
      userId: 'user-1',
      currency: Currency.NGN,
      balance: 5000,
    });
    walletRepository.save.mockImplementation(async (payload: any) => payload);
    transactionRepository.create.mockImplementation((payload: any) => payload);
    transactionRepository.save.mockImplementation(async (payload: any) => payload);
    kycProfileRepository.findOne.mockResolvedValue({ status: 'VERIFIED' });
    fincraWalletService.requestPermanentVirtualAccount.mockRejectedValue({
      response: {
        message: {
          code: 'FINCRA_VIRTUAL_ACCOUNT_REQUEST_FAILED',
          message: 'Fincra request timed out.',
        },
      },
    });

    const result = await service.activateWalletProduct(
      'user-1', 'CAD', validForeignWalletActivationPayload,
    );

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
      event: 'virtualaccount.issued',
      data: {
        id: 'fincra-request-1',
        status: 'pending',
        accountInformation: {
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
    userRepository.findOne.mockResolvedValue({ id: 'user-1' });
    notificationPreferenceRepository.findOne.mockResolvedValue({
      preferences: { push: false },
    });
    notificationDeviceRepository.find.mockResolvedValue([]);

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
    expect(notificationRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        title: 'CAD receive account activated',
        category: 'WALLET',
        read: false,
        metadata: expect.objectContaining({
          screen: 'ReceiveFunding',
          currency: 'CAD',
          status: 'ACTIVE',
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
    configService.get.mockImplementation((key: string) => key === 'METAMAP_WEBHOOK_SECRET' ? 'test-webhook-secret' : undefined);
    userRepository.findOne.mockResolvedValue({ id: 'user-1' });
    kycProfileRepository.findOne.mockResolvedValue({
      id: 'kyc-1',
      userId: 'user-1',
      status: 'IN_PROGRESS',
      region: 'US',
      provider: 'METAMAP',
      identity: { metamapSessionId: 'session-1' },
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
      metadata: { metamapSessionId: 'session-1' },
      status: 'APPROVED',
      verificationId: 'verification-1',
    };

    const signature = createHmac('sha256', 'test-webhook-secret').update(JSON.stringify(payload)).digest('hex');
    await expect(service.handleKycWebhook(payload, signature)).resolves.toEqual(
      expect.objectContaining({
        received: true,
        updated: true,
        status: 'MANUAL_REVIEW',
      }),
    );
    expect(userRepository.update).toHaveBeenCalledWith('user-1', {
      kycStatus: 'MANUAL_REVIEW',
    });
    expect(kycProfileRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'MANUAL_REVIEW',
        capabilities: expect.objectContaining({ canTransfer: false }),
        limits: expect.objectContaining({ accountProgressLevel: 3 }),
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
      metadata: { status: 'MANUAL_REVIEW', providerStatus: 'VERIFIED' },
    });
    await expect(service.handleKycWebhook(payload, signature)).resolves.toEqual(
      expect.objectContaining({
        received: true,
        updated: false,
        duplicate: true,
        status: 'MANUAL_REVIEW',
      }),
    );
  });

  it('updates the returned KYC user and writes an admin review audit record', async () => {
    const targetUser = { id: 'user-1', kycStatus: 'IN_PROGRESS', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-01-02' };
    userRepository.findOne
      .mockResolvedValueOnce({ id: 'admin-1', role: UserRole.SUPER_ADMIN })
      .mockResolvedValue(targetUser);
    kycProfileRepository.findOne.mockResolvedValue({
      id: 'kyc-1',
      userId: 'user-1',
      status: 'MANUAL_REVIEW',
      region: 'NG',
      providerReference: 'verification-1',
      updatedAt: new Date('2026-10-15T00:00:00Z'),
      capabilities: {},
      limits: {},
    });
    providerOperationRepository.findOne
      .mockResolvedValueOnce({ status: 'APPLIED', providerReference: 'verification-1', metadata: { providerStatus: 'VERIFIED' } })
      .mockResolvedValueOnce({ status: 'VERIFIED', metadata: { identityMatched: true, identityFingerprint: fincraIdentityFingerprint(targetUser), environment: 'sandbox' } });
    kycProfileRepository.update.mockResolvedValue({ affected: 1 });
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
      .mockResolvedValueOnce({ id: 'admin-1', role: UserRole.ADMIN })
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
      kycStatus: 'VERIFIED',
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

  it('creates a VTU.ng ledger hold before provider submission and finalizes later', async () => {
    const pin = await hash('1234', 4);
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      country: 'Nigeria',
      kycStatus: 'VERIFIED',
      pin,
    });
    providerOperationRepository.findOne.mockResolvedValue(null);
    providerOperationRepository.create.mockImplementation(
      (payload: any) => payload,
    );
    providerOperationRepository.save.mockImplementation(
      async (payload: any) => payload,
    );
    walletRepository.findOne.mockResolvedValue({
      id: 'wallet-ngn-1',
      userId: 'user-1',
      currency: Currency.NGN,
      balance: 5000,
    });
    walletRepository.save.mockImplementation(async (payload: any) => payload);
    transactionRepository.create.mockImplementation((payload: any) => payload);
    transactionRepository.save.mockImplementation(async (payload: any) => payload);
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
    expect(walletRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ balance: 4000 }),
    );
    expect(transactionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: 'vtu-airtime-1_vtu_hold',
        type: 'debit',
        status: 'PENDING',
        balanceBefore: 5000,
        balanceAfter: 4000,
      }),
    );
    expect(providerOperationRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'airtime',
        idempotencyKey: 'vtu-airtime-1',
        status: 'SUBMITTED',
        provider: 'VTU.ng',
        metadata: expect.objectContaining({
          ledgerFinalization: 'PENDING_PROVIDER_SETTLEMENT',
          holdTransactionReference: 'vtu-airtime-1_vtu_hold',
        }),
      }),
    );
  });


  it('reverses a VTU.ng ledger hold when the provider reports a refund', async () => {
    configService.get.mockImplementation((key: string) =>
      key === 'VTU_USER_PIN' ? 'pin-secret' : undefined,
    );
    const operation = {
      id: 'operation-1',
      userId: 'user-1',
      type: 'airtime',
      idempotencyKey: 'vtu-airtime-1',
      reference: 'vtu-airtime-1',
      status: 'SUBMITTED',
      amount: 1000,
      currency: Currency.NGN,
      provider: 'VTU.ng',
      providerReference: 'vtu-airtime-1',
      metadata: {
        walletId: 'wallet-ngn-1',
        holdTransactionReference: 'vtu-airtime-1_vtu_hold',
      },
    };
    providerOperationRepository.findOne.mockResolvedValue(operation);
    walletRepository.findOne.mockResolvedValue({
      id: 'wallet-ngn-1',
      userId: 'user-1',
      currency: Currency.NGN,
      balance: 4000,
    });
    walletRepository.save.mockImplementation(async (payload: any) => payload);
    transactionRepository.create.mockImplementation((payload: any) => payload);
    transactionRepository.save.mockImplementation(async (payload: any) => payload);
    providerOperationRepository.save.mockImplementation(
      async (payload: any) => payload,
    );
    const payload = { request_id: 'vtu-airtime-1', status: 'refunded' };
    const signature = require('crypto')
      .createHmac('sha256', 'pin-secret')
      .update(JSON.stringify(payload))
      .digest('hex');

    await expect(service.handleVtuWebhook(payload, signature)).resolves.toEqual(
      expect.objectContaining({ finalized: false, status: 'refunded' }),
    );

    expect(walletRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ balance: 5000 }),
    );
    expect(transactionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: 'vtu-airtime-1_vtu_reversal',
        type: 'credit',
        status: 'SUCCESS',
        balanceBefore: 4000,
        balanceAfter: 5000,
      }),
    );
    expect(providerOperationRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'REFUNDED',
        metadata: expect.objectContaining({ ledgerReversed: true }),
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
    walletRepository.findOne.mockResolvedValue({
      id: 'wallet-ngn-1',
      userId: 'user-1',
      currency: Currency.NGN,
      balance: 5000,
    });
    walletRepository.save.mockImplementation(async (payload: any) => payload);
    transactionRepository.create.mockImplementation((payload: any) => payload);
    transactionRepository.save.mockImplementation(async (payload: any) => payload);

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
      kycStatus: 'VERIFIED',
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
