import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { KycStatus } from 'src/common/enum/kyc-status.enum';
import { SupportedRegion } from 'src/common/enum/supported-region.enum';
import { AccountStatus } from 'src/database/entities/user.entity';
import {
  ProviderConnectionStatus,
  ProviderReadinessStatus,
} from 'src/providers/provider-status.enum';
import {
  InvestmentAccountStatus,
  InvestmentOrderStatus,
  InvestmentOrderType,
} from './investment.enums';
import { InvestmentService } from './investment.service';

describe('InvestmentService', () => {
  const readyProvider = {
    provider: 'Cowrywise',
    enabled: true,
    status: ProviderConnectionStatus.ACTIVE,
    readinessStatus: ProviderReadinessStatus.LIVE_TESTED,
    capabilities: ['products', 'portfolio', 'orders', 'webhooks'],
  };

  const createSubject = (overrides: Record<string, any> = {}) => {
    const repository = {
      findAccount: jest.fn().mockResolvedValue(null),
      createAccount: jest.fn().mockImplementation(async (input) => ({
        id: 'investment-account-id',
        ...input,
      })),
      updateAccount: jest.fn().mockImplementation(async (id, input) => ({
        id,
        ...input,
      })),
      findActiveProducts: jest.fn().mockResolvedValue([]),
      findPositions: jest.fn().mockResolvedValue([]),
      findOrders: jest.fn().mockResolvedValue([]),
      findFunding: jest.fn().mockResolvedValue([]),
      findOrderByIdempotency: jest.fn().mockResolvedValue(null),
      findProduct: jest.fn().mockResolvedValue({
        id: 'product-id',
        providerProductId: 'provider-product-id',
        minimumAmount: '1000',
        currency: 'NGN',
      }),
      createOrder: jest.fn().mockImplementation(async (input) => input),
      findFundingByIdempotency: jest.fn().mockResolvedValue(null),
      createFunding: jest.fn().mockImplementation(async (input) => input),
      findProductByProviderId: jest
        .fn()
        .mockResolvedValue({ id: 'product-id' }),
      upsertPosition: jest.fn().mockResolvedValue(undefined),
      upsertProduct: jest.fn().mockResolvedValue(undefined),
      ...overrides.repository,
    };
    const userRepository = {
      getUserById: jest.fn().mockResolvedValue({
        id: 'user-id',
        status: AccountStatus.ACTIVE,
        signupRegion: SupportedRegion.NG,
        kycStatus: KycStatus.VERIFIED,
        kyc: { status: KycStatus.VERIFIED },
      }),
      ...overrides.userRepository,
    };
    const providerStatusService = {
      getProviderStatuses: jest.fn().mockReturnValue([readyProvider]),
      ...overrides.providerStatusService,
    };
    const gateway = {
      execute: jest.fn().mockResolvedValue({
        provider: 'Cowrywise',
        providerReference: 'provider-reference',
        status: 'COMPLETED',
        data: {},
      }),
      ...overrides.gateway,
    };

    return {
      subject: new InvestmentService(
        repository as any,
        userRepository as any,
        providerStatusService as any,
        gateway as any,
      ),
      repository,
      gateway,
    };
  };

  it('opens a verified Nigerian investment account with the provider', async () => {
    const { subject, gateway } = createSubject();

    await expect(subject.openAccount('user-id')).resolves.toMatchObject({
      status: InvestmentAccountStatus.ACTIVE,
      providerAccountId: 'provider-reference',
    });
    expect(gateway.execute).toHaveBeenCalledWith(
      'account_create',
      expect.objectContaining({ currency: 'NGN' }),
      'investment-account-investment-account-id',
    );
  });

  it('rejects regions not supported by the configured custodian', async () => {
    const { subject } = createSubject({
      userRepository: {
        getUserById: jest.fn().mockResolvedValue({
          id: 'user-id',
          status: AccountStatus.ACTIVE,
          signupRegion: SupportedRegion.US,
          kycStatus: KycStatus.VERIFIED,
        }),
      },
    });

    await expect(subject.openAccount('user-id')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('returns the original order for an idempotent replay', async () => {
    const existing = {
      id: 'existing-order',
      status: InvestmentOrderStatus.SUBMITTED,
    };
    const { subject, gateway } = createSubject({
      repository: {
        findOrderByIdempotency: jest.fn().mockResolvedValue(existing),
      },
    });

    await expect(
      subject.createOrder('user-id', {
        idempotencyKey: 'investment-request-1',
        productId: 'product-id',
        type: InvestmentOrderType.SUBSCRIBE,
        amount: '1000',
      }),
    ).resolves.toBe(existing);
    expect(gateway.execute).not.toHaveBeenCalled();
  });

  it('enforces the provider product minimum using exact decimals', async () => {
    const { subject } = createSubject({
      repository: {
        findAccount: jest.fn().mockResolvedValue({
          id: 'investment-account-id',
          status: InvestmentAccountStatus.ACTIVE,
          providerAccountId: 'provider-account-id',
        }),
      },
    });

    await expect(
      subject.createOrder('user-id', {
        idempotencyKey: 'investment-request-1',
        productId: 'product-id',
        type: InvestmentOrderType.SUBSCRIBE,
        amount: '999.999999999999999999',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('fails closed when Cowrywise has not been live-certified', async () => {
    const { subject } = createSubject({
      repository: {
        findAccount: jest.fn().mockResolvedValue({
          id: 'investment-account-id',
          status: InvestmentAccountStatus.ACTIVE,
          providerAccountId: 'provider-account-id',
        }),
      },
      providerStatusService: {
        getProviderStatuses: jest.fn().mockReturnValue([
          {
            ...readyProvider,
            enabled: false,
            status: ProviderConnectionStatus.PENDING,
            readinessStatus: ProviderReadinessStatus.CONFIGURED_NOT_TESTED,
          },
        ]),
      },
    });

    await expect(
      subject.createOrder('user-id', {
        idempotencyKey: 'investment-request-1',
        productId: 'product-id',
        type: InvestmentOrderType.SUBSCRIBE,
        amount: '1000',
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('calculates an exact negative unrealized return from provider snapshots', async () => {
    const { subject, repository } = createSubject({
      repository: {
        findAccount: jest
          .fn()
          .mockResolvedValue({ id: 'investment-account-id' }),
      },
    });

    await subject.applyProviderPortfolioSnapshot('user-id', [
      {
        providerProductId: 'provider-product-id',
        units: '2.000000000000000001',
        investedAmount: '1000.000000000000000003',
        currentValue: '999.000000000000000001',
      },
    ]);

    expect(repository.upsertPosition).toHaveBeenCalledWith(
      expect.objectContaining({
        unrealizedReturn: '-1.000000000000000002',
      }),
    );
  });
});
