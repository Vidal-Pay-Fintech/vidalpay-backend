import { BadRequestException, ConflictException } from '@nestjs/common';
import { KycStatus } from 'src/common/enum/kyc-status.enum';
import { SupportedRegion } from 'src/common/enum/supported-region.enum';
import { AccountStatus } from 'src/database/entities/user.entity';
import {
  ProviderConnectionStatus,
  ProviderReadinessStatus,
} from 'src/providers/provider-status.enum';
import {
  TaxAccountStatus,
  TaxDocumentType,
  TaxFilingStatus,
} from './tax.enums';
import { TaxService } from './tax.service';

describe('TaxService', () => {
  const originalMode = process.env.TAX_PROVIDER_MODE;
  const readyProvider = {
    provider: 'April',
    enabled: true,
    status: ProviderConnectionStatus.ACTIVE,
    readinessStatus: ProviderReadinessStatus.LIVE_TESTED,
    capabilities: [
      'tax_status',
      'filing_start',
      'documents',
      'submit',
      'webhooks',
    ],
  };

  beforeEach(() => {
    process.env.TAX_PROVIDER_MODE = 'april';
  });

  afterAll(() => {
    if (originalMode === undefined) {
      delete process.env.TAX_PROVIDER_MODE;
    } else {
      process.env.TAX_PROVIDER_MODE = originalMode;
    }
  });

  const createSubject = (overrides: Record<string, any> = {}) => {
    const repository = {
      findAccount: jest.fn().mockResolvedValue(null),
      createAccount: jest.fn().mockImplementation(async (input) => ({
        id: 'tax-account-id',
        ...input,
      })),
      updateAccount: jest.fn().mockImplementation(async (id, input) => ({
        id,
        ...input,
      })),
      findFilings: jest.fn().mockResolvedValue([]),
      findFilingByIdempotency: jest.fn().mockResolvedValue(null),
      findFilingByYear: jest.fn().mockResolvedValue(null),
      createFiling: jest.fn().mockImplementation(async (input) => ({
        id: 'tax-filing-id',
        ...input,
      })),
      findFilingForUser: jest.fn().mockResolvedValue(null),
      findFilingWithSession: jest.fn().mockResolvedValue(null),
      findFilingByProviderId: jest.fn().mockResolvedValue(null),
      updateFiling: jest.fn().mockImplementation(async (id, input) => ({
        id,
        ...input,
      })),
      createEvent: jest.fn().mockResolvedValue(undefined),
      findDocuments: jest.fn().mockResolvedValue([]),
      findEvents: jest.fn().mockResolvedValue([]),
      findDocumentByIdempotency: jest.fn().mockResolvedValue(null),
      createDocument: jest.fn().mockImplementation(async (input) => ({
        id: 'tax-document-id',
        ...input,
      })),
      ...overrides.repository,
    };
    const userRepository = {
      getUserById: jest.fn().mockResolvedValue({
        id: 'user-id',
        status: AccountStatus.ACTIVE,
        signupRegion: SupportedRegion.US,
        kycStatus: KycStatus.VERIFIED,
        kyc: { status: KycStatus.VERIFIED, countryCode: 'US' },
      }),
      ...overrides.userRepository,
    };
    const providerStatusService = {
      getProviderStatuses: jest.fn().mockReturnValue([readyProvider]),
      ...overrides.providerStatusService,
    };
    const gateway = {
      getProviderSlug: jest.fn().mockReturnValue('april'),
      execute: jest.fn().mockResolvedValue({
        provider: 'April',
        providerReference: 'provider-reference',
        status: 'COMPLETED',
        data: {},
      }),
      ...overrides.gateway,
    };

    return {
      subject: new TaxService(
        repository as any,
        userRepository as any,
        providerStatusService as any,
        gateway as any,
      ),
      repository,
      gateway,
    };
  };

  it('opens a verified US tax account with the selected provider', async () => {
    const { subject, gateway } = createSubject();

    await expect(subject.openAccount('user-id')).resolves.toMatchObject({
      status: TaxAccountStatus.ACTIVE,
      providerAccountId: 'provider-reference',
      provider: 'April',
    });
    expect(gateway.execute).toHaveBeenCalledWith(
      'account_create',
      expect.objectContaining({ jurisdiction: 'US' }),
      'tax-account-tax-account-id',
    );
  });

  it('rejects a region unsupported by the selected tax providers', async () => {
    const { subject } = createSubject({
      userRepository: {
        getUserById: jest.fn().mockResolvedValue({
          id: 'user-id',
          status: AccountStatus.ACTIVE,
          signupRegion: SupportedRegion.NG,
          kycStatus: KycStatus.VERIFIED,
        }),
      },
    });

    await expect(subject.openAccount('user-id')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('creates a local filing draft and an append-only audit event', async () => {
    const { subject, repository } = createSubject({
      repository: {
        findAccount: jest.fn().mockResolvedValue({
          id: 'tax-account-id',
          status: TaxAccountStatus.PENDING_PROVIDER,
        }),
      },
    });
    const taxYear = new Date().getUTCFullYear() - 1;

    await expect(
      subject.createFiling('user-id', {
        idempotencyKey: 'tax-filing-request-1',
        taxYear,
      }),
    ).resolves.toMatchObject({
      taxYear,
      status: TaxFilingStatus.DRAFT,
    });
    expect(repository.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        status: TaxFilingStatus.DRAFT,
      }),
    );
  });

  it('never exposes stored provider payload or storage references', async () => {
    const filing = {
      id: 'tax-filing-id',
      userId: 'user-id',
      accountId: 'tax-account-id',
      providerFilingId: 'provider-filing-id',
      status: TaxFilingStatus.PREPARING,
    };
    const { subject } = createSubject({
      repository: {
        findAccount: jest.fn().mockResolvedValue({
          id: 'tax-account-id',
          status: TaxAccountStatus.ACTIVE,
          providerAccountId: 'provider-account-id',
        }),
        findFilingForUser: jest.fn().mockResolvedValue(filing),
        createDocument: jest.fn().mockImplementation(async (input) => ({
          id: 'tax-document-id',
          ...input,
          storageReference: 'private/storage/key',
          providerPayload: { sensitive: true },
        })),
      },
      gateway: {
        execute: jest.fn().mockResolvedValue({
          providerReference: 'provider-document-id',
          status: 'COMPLETED',
          data: { uploadUrl: 'https://provider.example/upload' },
        }),
      },
    });

    const result = await subject.registerDocument('user-id', filing.id, {
      idempotencyKey: 'tax-document-request-1',
      type: TaxDocumentType.W2,
    });

    expect(result.document).not.toHaveProperty('storageReference');
    expect(result.document).not.toHaveProperty('providerPayload');
    expect(result.uploadUrl).toBe('https://provider.example/upload');
  });

  it('accepts valid provider transitions and exact tax estimates', async () => {
    const filing = {
      id: 'tax-filing-id',
      userId: 'user-id',
      status: TaxFilingStatus.SUBMITTED,
      estimatedRefund: null,
      estimatedAmountDue: null,
    };
    const { subject, repository } = createSubject({
      repository: {
        findFilingByProviderId: jest.fn().mockResolvedValue(filing),
        findFilingForUser: jest.fn().mockResolvedValue({
          ...filing,
          status: TaxFilingStatus.ACCEPTED,
          estimatedRefund: '1234.560000000000000001',
        }),
      },
    });

    await subject.applyProviderStatus({
      providerFilingId: 'provider-filing-id',
      status: TaxFilingStatus.ACCEPTED,
      estimatedRefund: '1234.560000000000000001',
    });

    expect(repository.updateFiling).toHaveBeenCalledWith(
      filing.id,
      expect.objectContaining({
        status: TaxFilingStatus.ACCEPTED,
        estimatedRefund: '1234.560000000000000001',
      }),
    );
  });

  it('rejects impossible filing transitions', async () => {
    const { subject } = createSubject({
      repository: {
        findFilingByProviderId: jest.fn().mockResolvedValue({
          id: 'tax-filing-id',
          userId: 'user-id',
          status: TaxFilingStatus.DRAFT,
        }),
      },
    });

    await expect(
      subject.applyProviderStatus({
        providerFilingId: 'provider-filing-id',
        status: TaxFilingStatus.ACCEPTED,
      }),
    ).rejects.toThrow(ConflictException);
  });
});
