import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { KycStatus } from 'src/common/enum/kyc-status.enum';
import { AccountStatus } from 'src/database/entities/user.entity';
import {
  ProviderConnectionStatus,
  ProviderReadinessStatus,
} from 'src/providers/provider-status.enum';
import {
  CryptoAccountStatus,
  CryptoAsset,
  CryptoOrderSide,
  CryptoOrderStatus,
  CryptoOrderType,
} from './crypto.enums';
import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
  const readyProvider = {
    provider: 'Zero Hash',
    enabled: true,
    status: ProviderConnectionStatus.ACTIVE,
    readinessStatus: ProviderReadinessStatus.LIVE_TESTED,
    capabilities: ['assets', 'trade', 'transactions', 'staking'],
  };

  const createSubject = (overrides: Record<string, any> = {}) => {
    const repository = {
      findAccount: jest.fn().mockResolvedValue(null),
      createAccount: jest.fn().mockImplementation(async (input) => ({
        id: 'crypto-account-id',
        ...input,
      })),
      updateAccount: jest.fn().mockImplementation(async (id, input) => ({
        id,
        ...input,
      })),
      findBalances: jest.fn().mockResolvedValue([]),
      upsertBalance: jest.fn().mockResolvedValue(undefined),
      findOrders: jest.fn().mockResolvedValue([]),
      findTransfers: jest.fn().mockResolvedValue([]),
      findStakingPositions: jest.fn().mockResolvedValue([]),
      findOrderByIdempotency: jest.fn().mockResolvedValue(null),
      createOrder: jest.fn().mockImplementation(async (input) => input),
      findDepositAddressByIdempotency: jest.fn().mockResolvedValue(null),
      createDepositAddress: jest
        .fn()
        .mockImplementation(async (input) => input),
      findTransferByIdempotency: jest.fn().mockResolvedValue(null),
      createTransfer: jest.fn().mockImplementation(async (input) => input),
      findStakingByIdempotency: jest.fn().mockResolvedValue(null),
      createStakingPosition: jest
        .fn()
        .mockImplementation(async (input) => input),
      findDepositAddresses: jest.fn().mockResolvedValue([]),
      ...overrides.repository,
    };
    const userRepository = {
      getUserById: jest.fn().mockResolvedValue({
        id: 'user-id',
        status: AccountStatus.ACTIVE,
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
        provider: 'Zero Hash',
        providerReference: 'provider-reference',
        status: 'COMPLETED',
        data: {},
      }),
      ...overrides.gateway,
    };

    return {
      subject: new CryptoService(
        repository as any,
        userRepository as any,
        providerStatusService as any,
        gateway as any,
      ),
      repository,
      gateway,
    };
  };

  it('opens a local account and initializes exact zero balances', async () => {
    const { subject, repository, gateway } = createSubject();

    await expect(subject.openAccount('user-id')).resolves.toMatchObject({
      status: CryptoAccountStatus.ACTIVE,
      providerAccountId: 'provider-reference',
    });
    expect(repository.upsertBalance).toHaveBeenCalledTimes(3);
    expect(gateway.execute).toHaveBeenCalledWith(
      'account_create',
      expect.anything(),
      'crypto-account-crypto-account-id',
    );
  });

  it('keeps an unverified account pending KYC without calling the provider', async () => {
    const { subject, gateway } = createSubject({
      userRepository: {
        getUserById: jest.fn().mockResolvedValue({
          id: 'user-id',
          status: AccountStatus.ACTIVE,
          kycStatus: KycStatus.NOT_STARTED,
          kyc: null,
        }),
      },
    });

    await expect(subject.openAccount('user-id')).resolves.toMatchObject({
      status: CryptoAccountStatus.PENDING_KYC,
    });
    expect(gateway.execute).not.toHaveBeenCalled();
  });

  it('returns an existing order for a repeated idempotency key', async () => {
    const existing = {
      id: 'existing-order',
      status: CryptoOrderStatus.SUBMITTED,
    };
    const { subject, gateway } = createSubject({
      repository: {
        findOrderByIdempotency: jest.fn().mockResolvedValue(existing),
      },
    });

    await expect(
      subject.createOrder('user-id', {
        idempotencyKey: 'request-123',
        side: CryptoOrderSide.BUY,
        orderType: CryptoOrderType.MARKET,
        asset: CryptoAsset.BTC,
        quantity: '0.001',
      }),
    ).resolves.toBe(existing);
    expect(gateway.execute).not.toHaveBeenCalled();
  });

  it('fails closed when the live provider is not certified', async () => {
    const { subject } = createSubject({
      repository: {
        findAccount: jest.fn().mockResolvedValue({
          id: 'crypto-account-id',
          status: CryptoAccountStatus.ACTIVE,
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
        idempotencyKey: 'request-123',
        side: CryptoOrderSide.BUY,
        orderType: CryptoOrderType.MARKET,
        asset: CryptoAsset.BTC,
        quantity: '0.001',
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('does not allow activity on a provider-pending account', async () => {
    const { subject } = createSubject({
      repository: {
        findAccount: jest.fn().mockResolvedValue({
          id: 'crypto-account-id',
          status: CryptoAccountStatus.PENDING_PROVIDER,
        }),
      },
    });

    await expect(
      subject.createOrder('user-id', {
        idempotencyKey: 'request-123',
        side: CryptoOrderSide.BUY,
        orderType: CryptoOrderType.MARKET,
        asset: CryptoAsset.BTC,
        quantity: '0.001',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('adds portfolio decimals without floating-point arithmetic', async () => {
    const { subject } = createSubject({
      repository: {
        findAccount: jest.fn().mockResolvedValue({ id: 'crypto-account-id' }),
        findBalances: jest.fn().mockResolvedValue([
          {
            asset: CryptoAsset.BTC,
            available: '0.100000000000000001',
            held: '0.200000000000000002',
          },
        ]),
      },
    });

    await expect(subject.getPortfolio('user-id')).resolves.toMatchObject({
      positions: [{ total: '0.300000000000000003' }],
    });
  });
});
