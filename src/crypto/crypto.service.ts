import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { KycStatus } from 'src/common/enum/kyc-status.enum';
import { AccountStatus } from 'src/database/entities/user.entity';
import { CryptoRepository } from 'src/database/repositories/crypto.repository';
import { ProviderStatusService } from 'src/providers/provider-status.service';
import { UserRepository } from 'src/database/repositories/user.repository';
import {
  ProviderConnectionStatus,
  ProviderReadinessStatus,
} from 'src/providers/provider-status.enum';
import {
  CryptoAccountStatus,
  CryptoAsset,
  CryptoOrderStatus,
  CryptoOrderType,
  CryptoStakingStatus,
  CryptoTransferStatus,
  CryptoTransferType,
} from './crypto.enums';
import { CryptoProviderGateway } from './crypto-provider.gateway';
import {
  CreateCryptoOrderDto,
  CreateCryptoStakeDto,
  CryptoDepositAddressDto,
  CryptoWithdrawalDto,
} from './dto/crypto-request.dto';

const CRYPTO_ASSETS = [
  { symbol: CryptoAsset.BTC, name: 'Bitcoin', decimals: 8 },
  { symbol: CryptoAsset.ETH, name: 'Ethereum', decimals: 18 },
  { symbol: CryptoAsset.USDT, name: 'Tether', decimals: 6 },
];

@Injectable()
export class CryptoService {
  constructor(
    private readonly cryptoRepository: CryptoRepository,
    private readonly userRepository: UserRepository,
    private readonly providerStatusService: ProviderStatusService,
    private readonly providerGateway: CryptoProviderGateway,
  ) {}

  async getOverview(userId: string) {
    const [account, balances, orders, transfers, staking] = await Promise.all([
      this.cryptoRepository.findAccount(userId),
      this.cryptoRepository.findBalances(userId),
      this.cryptoRepository.findOrders(userId),
      this.cryptoRepository.findTransfers(userId),
      this.cryptoRepository.findStakingPositions(userId),
    ]);
    const provider = this.getProviderStatus();

    return {
      enabled: provider.readinessStatus === ProviderReadinessStatus.LIVE_TESTED,
      provider,
      account,
      portfolio: this.serializePortfolio(balances),
      activity: {
        orders: orders.slice(0, 10),
        transfers: transfers.slice(0, 10),
        staking: staking.slice(0, 10),
      },
    };
  }

  getAssets() {
    const provider = this.getProviderStatus();
    const live =
      provider.readinessStatus === ProviderReadinessStatus.LIVE_TESTED;
    return CRYPTO_ASSETS.map((asset) => ({
      ...asset,
      tradingAvailable: live,
      depositsAvailable: live,
      withdrawalsAvailable: live,
      stakingAvailable: live && provider.capabilities.includes('staking'),
    }));
  }

  getAccount(userId: string) {
    return this.cryptoRepository.findAccount(userId);
  }

  async openAccount(userId: string) {
    const existing = await this.cryptoRepository.findAccount(userId);
    if (existing) {
      return existing;
    }

    const user = await this.userRepository.getUserById(userId);
    const kycVerified =
      user.kyc?.status === KycStatus.VERIFIED ||
      user.kycStatus === KycStatus.VERIFIED;
    const providerReady = this.isProviderReady();
    const account = await this.cryptoRepository.createAccount({
      userId,
      provider: 'Zero Hash',
      status: !kycVerified
        ? CryptoAccountStatus.PENDING_KYC
        : CryptoAccountStatus.PENDING_PROVIDER,
      metadata: {
        kycVerified,
        providerReady,
      },
    });
    await this.initializeBalances(userId, account.id);

    if (!kycVerified || !providerReady) {
      return account;
    }

    try {
      const execution = await this.providerGateway.execute(
        'account_create',
        { userId, accountId: account.id },
        `crypto-account-${account.id}`,
      );
      const providerAccountId =
        execution.providerReference ??
        this.pickString(execution.data, 'accountId');
      if (
        !providerAccountId ||
        !['ACTIVE', 'COMPLETED', 'SUCCESS', 'SUCCEEDED'].includes(
          execution.status.toUpperCase(),
        )
      ) {
        return this.cryptoRepository.updateAccount(account.id, {
          status: CryptoAccountStatus.PENDING_PROVIDER,
          metadata: { providerPayload: execution.data },
        });
      }
      return this.cryptoRepository.updateAccount(account.id, {
        status: CryptoAccountStatus.ACTIVE,
        providerAccountId,
        metadata: { providerPayload: execution.data },
      });
    } catch (error) {
      return this.cryptoRepository.updateAccount(account.id, {
        status: CryptoAccountStatus.PENDING_PROVIDER,
        metadata: {
          kycVerified: true,
          providerReady: true,
          provisioningError: this.safeErrorMessage(error),
        },
      });
    }
  }

  async getPortfolio(userId: string) {
    await this.requireAccount(userId);
    const balances = await this.cryptoRepository.findBalances(userId);
    return this.serializePortfolio(balances);
  }

  listOrders(userId: string) {
    return this.cryptoRepository.findOrders(userId);
  }

  async cancelOrder(userId: string, orderId: string, idempotencyKey: string) {
    const account = await this.requireActiveAccount(userId);
    const order = await this.cryptoRepository.findOrderForUser(userId, orderId);
    if (!order) {
      throw new NotFoundException('Crypto order not found.');
    }
    if (
      [
        CryptoOrderStatus.FILLED,
        CryptoOrderStatus.CANCELLED,
        CryptoOrderStatus.REJECTED,
        CryptoOrderStatus.FAILED,
      ].includes(order.status)
    ) {
      return order;
    }

    this.assertProviderReady('trade');
    const execution = await this.providerGateway.execute(
      'trade_cancel',
      {
        accountId: account.providerAccountId,
        providerOrderId: order.providerOrderId,
      },
      idempotencyKey,
    );
    return this.cryptoRepository.updateOrder(order.id, {
      status:
        execution.status.toUpperCase() === 'FAILED'
          ? CryptoOrderStatus.FAILED
          : CryptoOrderStatus.CANCELLED,
      providerPayload: execution.data,
    });
  }

  async createOrder(userId: string, dto: CreateCryptoOrderDto) {
    const existing = await this.cryptoRepository.findOrderByIdempotency(
      userId,
      dto.idempotencyKey,
    );
    if (existing) {
      return existing;
    }

    const account = await this.requireActiveAccount(userId);
    this.assertProviderReady('trade');
    if (dto.orderType === CryptoOrderType.LIMIT && !dto.limitPrice) {
      throw new BadRequestException('limitPrice is required for limit orders.');
    }

    const execution = await this.providerGateway.execute(
      'trade',
      {
        accountId: account.providerAccountId,
        side: dto.side,
        orderType: dto.orderType,
        asset: dto.asset,
        quoteAsset: 'USD',
        quantity: dto.quantity,
        limitPrice: dto.limitPrice ?? null,
      },
      dto.idempotencyKey,
    );

    return this.cryptoRepository.createOrder({
      userId,
      accountId: account.id,
      idempotencyKey: dto.idempotencyKey,
      providerOrderId: execution.providerReference,
      side: dto.side,
      orderType: dto.orderType,
      asset: dto.asset,
      quoteAsset: 'USD',
      quantity: dto.quantity,
      limitPrice: dto.limitPrice ?? null,
      executedQuantity: '0',
      averagePrice: null,
      status: this.mapOrderStatus(execution.status),
      providerPayload: execution.data,
    });
  }

  listDepositAddresses(userId: string) {
    return this.cryptoRepository.findDepositAddresses(userId);
  }

  async createDepositAddress(userId: string, dto: CryptoDepositAddressDto) {
    const existing =
      await this.cryptoRepository.findDepositAddressByIdempotency(
        userId,
        dto.idempotencyKey,
      );
    if (existing) {
      return existing;
    }

    const account = await this.requireActiveAccount(userId);
    this.assertProviderReady('transactions');
    const execution = await this.providerGateway.execute(
      'deposit_address',
      {
        accountId: account.providerAccountId,
        asset: dto.asset,
        network: dto.network ?? null,
      },
      dto.idempotencyKey,
    );
    const address = this.pickString(execution.data, 'address');
    if (!address) {
      throw new ServiceUnavailableException(
        'The crypto provider did not return a deposit address.',
      );
    }

    return this.cryptoRepository.createDepositAddress({
      userId,
      accountId: account.id,
      idempotencyKey: dto.idempotencyKey,
      asset: dto.asset,
      network: dto.network ?? this.pickString(execution.data, 'network'),
      address,
      providerReference: execution.providerReference,
      active: true,
      providerPayload: execution.data,
    });
  }

  listTransfers(userId: string) {
    return this.cryptoRepository.findTransfers(userId);
  }

  async withdraw(userId: string, dto: CryptoWithdrawalDto) {
    const existing = await this.cryptoRepository.findTransferByIdempotency(
      userId,
      dto.idempotencyKey,
    );
    if (existing) {
      return existing;
    }

    const account = await this.requireActiveAccount(userId);
    this.assertProviderReady('transactions');
    await this.assertSufficientBalance(userId, dto.asset, dto.amount);
    const execution = await this.providerGateway.execute(
      'withdrawal',
      {
        accountId: account.providerAccountId,
        asset: dto.asset,
        amount: dto.amount,
        address: dto.address,
        network: dto.network ?? null,
      },
      dto.idempotencyKey,
    );

    return this.cryptoRepository.createTransfer({
      userId,
      accountId: account.id,
      idempotencyKey: dto.idempotencyKey,
      type: CryptoTransferType.WITHDRAWAL,
      asset: dto.asset,
      amount: dto.amount,
      network: dto.network ?? null,
      address: dto.address,
      transactionHash: this.pickString(execution.data, 'transactionHash'),
      providerReference: execution.providerReference,
      status: this.mapTransferStatus(execution.status),
      providerPayload: execution.data,
    });
  }

  listStakingPositions(userId: string) {
    return this.cryptoRepository.findStakingPositions(userId);
  }

  async stake(userId: string, dto: CreateCryptoStakeDto) {
    const existing = await this.cryptoRepository.findStakingByIdempotency(
      userId,
      dto.idempotencyKey,
    );
    if (existing) {
      return existing;
    }

    const account = await this.requireActiveAccount(userId);
    this.assertProviderReady('staking');
    await this.assertSufficientBalance(userId, dto.asset, dto.amount);
    const execution = await this.providerGateway.execute(
      'stake',
      {
        accountId: account.providerAccountId,
        asset: dto.asset,
        amount: dto.amount,
      },
      dto.idempotencyKey,
    );

    return this.cryptoRepository.createStakingPosition({
      userId,
      accountId: account.id,
      idempotencyKey: dto.idempotencyKey,
      asset: dto.asset,
      amount: dto.amount,
      accruedRewards: '0',
      status: this.mapStakingStatus(execution.status),
      providerReference: execution.providerReference,
      providerPayload: execution.data,
    });
  }

  async unstake(userId: string, positionId: string, idempotencyKey: string) {
    const account = await this.requireActiveAccount(userId);
    const position = await this.cryptoRepository.findStakingPositionForUser(
      userId,
      positionId,
    );
    if (!position) {
      throw new NotFoundException('Crypto staking position not found.');
    }
    if (position.status === CryptoStakingStatus.COMPLETED) {
      return position;
    }
    if (position.status !== CryptoStakingStatus.ACTIVE) {
      throw new ConflictException('Staking position is not active.');
    }

    this.assertProviderReady('staking');
    const execution = await this.providerGateway.execute(
      'unstake',
      {
        accountId: account.providerAccountId,
        providerReference: position.providerReference,
        asset: position.asset,
        amount: position.amount,
      },
      idempotencyKey,
    );
    return this.cryptoRepository.updateStakingPosition(position.id, {
      status:
        execution.status.toUpperCase() === 'COMPLETED'
          ? CryptoStakingStatus.COMPLETED
          : CryptoStakingStatus.UNSTAKING,
      providerPayload: execution.data,
    });
  }

  async applyProviderBalanceSnapshot(
    userId: string,
    snapshots: Array<{
      asset: CryptoAsset;
      available: string;
      held: string;
      providerReference?: string | null;
    }>,
  ) {
    const account = await this.requireAccount(userId);
    for (const snapshot of snapshots) {
      this.toAtomicUnits(snapshot.available);
      this.toAtomicUnits(snapshot.held);
      await this.cryptoRepository.upsertBalance({
        userId,
        accountId: account.id,
        asset: snapshot.asset,
        available: snapshot.available,
        held: snapshot.held,
        metadata: {
          providerReference: snapshot.providerReference ?? null,
          reconciledAt: new Date().toISOString(),
        },
      });
    }
    return this.getPortfolio(userId);
  }

  private async initializeBalances(userId: string, accountId: string) {
    await Promise.all(
      Object.values(CryptoAsset).map((asset) =>
        this.cryptoRepository.upsertBalance({
          userId,
          accountId,
          asset,
          available: '0',
          held: '0',
          metadata: null,
        }),
      ),
    );
  }

  private async requireAccount(userId: string) {
    const account = await this.cryptoRepository.findAccount(userId);
    if (!account) {
      throw new NotFoundException('Crypto account has not been opened.');
    }
    return account;
  }

  private async requireActiveAccount(userId: string) {
    const account = await this.requireAccount(userId);
    const user = await this.userRepository.getUserById(userId);
    const kycVerified =
      user.kyc?.status === KycStatus.VERIFIED ||
      user.kycStatus === KycStatus.VERIFIED;
    if (!kycVerified) {
      throw new PreconditionFailedException(
        'Verified KYC is required for crypto activity.',
      );
    }
    if (user.status !== AccountStatus.ACTIVE) {
      throw new PreconditionFailedException(
        'An active Vidal Pay account is required for crypto activity.',
      );
    }
    if (account.status === CryptoAccountStatus.PENDING_KYC) {
      throw new PreconditionFailedException(
        'Complete KYC before using crypto products.',
      );
    }
    if (account.status !== CryptoAccountStatus.ACTIVE) {
      throw new ConflictException(
        'Crypto account is not active with the provider.',
      );
    }
    return account;
  }

  private getProviderStatus() {
    const provider = this.providerStatusService
      .getProviderStatuses()
      .find((candidate) => candidate.provider === 'Zero Hash');
    if (!provider) {
      throw new ServiceUnavailableException(
        'Zero Hash provider status is unavailable.',
      );
    }
    return provider;
  }

  private isProviderReady() {
    const provider = this.getProviderStatus();
    return (
      provider.enabled &&
      provider.status === ProviderConnectionStatus.ACTIVE &&
      provider.readinessStatus === ProviderReadinessStatus.LIVE_TESTED
    );
  }

  private assertProviderReady(capability: string) {
    const provider = this.getProviderStatus();
    if (
      !this.isProviderReady() ||
      !provider.capabilities.includes(capability)
    ) {
      throw new ServiceUnavailableException(
        `Crypto ${capability} is unavailable until the live provider capability is certified.`,
      );
    }
  }

  private async assertSufficientBalance(
    userId: string,
    asset: CryptoAsset,
    amount: string,
  ) {
    const balances = await this.cryptoRepository.findBalances(userId);
    const balance = balances.find((candidate) => candidate.asset === asset);
    if (
      !balance ||
      this.toAtomicUnits(balance.available) < this.toAtomicUnits(amount)
    ) {
      throw new BadRequestException(`Insufficient ${asset} balance.`);
    }
  }

  private toAtomicUnits(value: string): bigint {
    if (!/^\d+(?:\.\d{1,18})?$/.test(String(value))) {
      throw new BadRequestException('Invalid crypto decimal amount.');
    }
    const [whole, fraction = ''] = String(value).split('.');
    return BigInt(`${whole}${fraction.padEnd(18, '0').slice(0, 18)}`);
  }

  private serializePortfolio(
    balances: Array<{ asset: CryptoAsset; available: string; held: string }>,
  ) {
    return {
      valuationCurrency: 'USD',
      totalValue: null,
      valuationStatus: 'AWAITING_LIVE_PRICES',
      positions: balances.map((balance) => ({
        asset: balance.asset,
        available: balance.available,
        held: balance.held,
        total: this.addDecimals(balance.available, balance.held),
        usdValue: null,
      })),
    };
  }

  private addDecimals(left: string, right: string): string {
    const total = this.toAtomicUnits(left) + this.toAtomicUnits(right);
    const raw = total.toString().padStart(19, '0');
    const whole = raw.slice(0, -18);
    const fraction = raw.slice(-18).replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : whole;
  }

  private mapOrderStatus(status: string): CryptoOrderStatus {
    const normalized = status.toUpperCase();
    return Object.values(CryptoOrderStatus).includes(
      normalized as CryptoOrderStatus,
    )
      ? (normalized as CryptoOrderStatus)
      : CryptoOrderStatus.SUBMITTED;
  }

  private mapTransferStatus(status: string): CryptoTransferStatus {
    const normalized = status.toUpperCase();
    return Object.values(CryptoTransferStatus).includes(
      normalized as CryptoTransferStatus,
    )
      ? (normalized as CryptoTransferStatus)
      : CryptoTransferStatus.PENDING;
  }

  private mapStakingStatus(status: string): CryptoStakingStatus {
    const normalized = status.toUpperCase();
    return Object.values(CryptoStakingStatus).includes(
      normalized as CryptoStakingStatus,
    )
      ? (normalized as CryptoStakingStatus)
      : CryptoStakingStatus.SUBMITTED;
  }

  private pickString(
    data: Record<string, unknown>,
    key: string,
  ): string | null {
    const value = data[key];
    return typeof value === 'string' && value.trim() ? value : null;
  }

  private safeErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Provider request failed.';
  }
}
