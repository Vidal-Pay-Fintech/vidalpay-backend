import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { KycStatus } from 'src/common/enum/kyc-status.enum';
import { SupportedRegion } from 'src/common/enum/supported-region.enum';
import { AccountStatus } from 'src/database/entities/user.entity';
import { InvestmentPosition } from 'src/database/entities/investment-position.entity';
import { InvestmentRepository } from 'src/database/repositories/investment.repository';
import { UserRepository } from 'src/database/repositories/user.repository';
import {
  ProviderConnectionStatus,
  ProviderReadinessStatus,
} from 'src/providers/provider-status.enum';
import { ProviderStatusService } from 'src/providers/provider-status.service';
import {
  InvestmentAccountStatus,
  InvestmentFundingStatus,
  InvestmentFundingType,
  InvestmentOrderStatus,
  InvestmentOrderType,
  InvestmentPositionStatus,
  InvestmentRiskLevel,
} from './investment.enums';
import { InvestmentProviderGateway } from './investment-provider.gateway';
import {
  CreateInvestmentOrderDto,
  InvestmentFundingDto,
} from './dto/investment-request.dto';

@Injectable()
export class InvestmentService {
  constructor(
    private readonly investmentRepository: InvestmentRepository,
    private readonly userRepository: UserRepository,
    private readonly providerStatusService: ProviderStatusService,
    private readonly providerGateway: InvestmentProviderGateway,
  ) {}

  async getOverview(userId: string) {
    const [account, products, positions, orders, funding] = await Promise.all([
      this.investmentRepository.findAccount(userId),
      this.investmentRepository.findActiveProducts(),
      this.investmentRepository.findPositions(userId),
      this.investmentRepository.findOrders(userId),
      this.investmentRepository.findFunding(userId),
    ]);
    return {
      enabled: this.isProviderReady(),
      provider: this.getProviderStatus(),
      account,
      products,
      portfolio: this.serializePortfolio(positions),
      activity: {
        orders: orders.slice(0, 10),
        funding: funding.slice(0, 10),
      },
    };
  }

  getAccount(userId: string) {
    return this.investmentRepository.findAccount(userId);
  }

  async openAccount(userId: string) {
    const existing = await this.investmentRepository.findAccount(userId);
    if (existing) {
      return existing;
    }

    const user = await this.userRepository.getUserById(userId);
    this.assertSupportedRegion(this.resolveUserRegion(user));
    const kycVerified = this.isKycVerified(user);
    const account = await this.investmentRepository.createAccount({
      userId,
      provider: 'Cowrywise',
      currency: 'NGN',
      status: kycVerified
        ? InvestmentAccountStatus.PENDING_PROVIDER
        : InvestmentAccountStatus.PENDING_KYC,
      metadata: { kycVerified, providerReady: this.isProviderReady() },
    });

    if (!kycVerified || !this.isProviderReady()) {
      return account;
    }

    try {
      const execution = await this.providerGateway.execute(
        'account_create',
        { userId, accountId: account.id, currency: account.currency },
        `investment-account-${account.id}`,
      );
      const providerAccountId =
        execution.providerReference ??
        this.pickString(execution.data, 'accountId');
      const succeeded = [
        'ACTIVE',
        'COMPLETED',
        'SUCCESS',
        'SUCCEEDED',
      ].includes(execution.status.toUpperCase());
      return this.investmentRepository.updateAccount(account.id, {
        status:
          succeeded && providerAccountId
            ? InvestmentAccountStatus.ACTIVE
            : InvestmentAccountStatus.PENDING_PROVIDER,
        providerAccountId,
        metadata: { providerPayload: execution.data },
      });
    } catch (error) {
      return this.investmentRepository.updateAccount(account.id, {
        status: InvestmentAccountStatus.PENDING_PROVIDER,
        metadata: { provisioningError: this.safeErrorMessage(error) },
      });
    }
  }

  getProducts() {
    return this.investmentRepository.findActiveProducts();
  }

  async syncProducts() {
    this.assertProviderReady('products');
    const execution = await this.providerGateway.execute(
      'products',
      {},
      `investment-products-${new Date().toISOString().slice(0, 10)}`,
    );
    const products = Array.isArray(execution.data.products)
      ? execution.data.products
      : [];
    for (const rawProduct of products) {
      if (!this.isRecord(rawProduct)) {
        continue;
      }
      const providerProductId = this.pickString(rawProduct, 'id');
      const name = this.pickString(rawProduct, 'name');
      const minimumAmount = this.pickString(rawProduct, 'minimumAmount');
      if (!providerProductId || !name || !minimumAmount) {
        continue;
      }
      this.toAtomicUnits(minimumAmount);
      await this.investmentRepository.upsertProduct({
        providerProductId,
        name,
        description: this.pickString(rawProduct, 'description'),
        currency: this.pickString(rawProduct, 'currency') ?? 'NGN',
        riskLevel: this.mapRiskLevel(this.pickString(rawProduct, 'riskLevel')),
        minimumAmount,
        active: rawProduct.active !== false,
        providerPayload: rawProduct,
      });
    }
    return this.getProducts();
  }

  async getPortfolio(userId: string) {
    await this.requireAccount(userId);
    return this.serializePortfolio(
      await this.investmentRepository.findPositions(userId),
    );
  }

  listOrders(userId: string) {
    return this.investmentRepository.findOrders(userId);
  }

  async createOrder(userId: string, dto: CreateInvestmentOrderDto) {
    const existing = await this.investmentRepository.findOrderByIdempotency(
      userId,
      dto.idempotencyKey,
    );
    if (existing) {
      return existing;
    }

    const account = await this.requireActiveAccount(userId);
    const product = await this.investmentRepository.findProduct(dto.productId);
    if (!product) {
      throw new NotFoundException('Investment product not found.');
    }
    if (
      dto.type === InvestmentOrderType.SUBSCRIBE &&
      this.toAtomicUnits(dto.amount) < this.toAtomicUnits(product.minimumAmount)
    ) {
      throw new BadRequestException(
        `Minimum subscription amount is ${product.minimumAmount} ${product.currency}.`,
      );
    }

    this.assertProviderReady('orders');
    const execution = await this.providerGateway.execute(
      dto.type === InvestmentOrderType.SUBSCRIBE ? 'subscribe' : 'redeem',
      {
        accountId: account.providerAccountId,
        productId: product.providerProductId,
        amount: dto.amount,
        currency: product.currency,
      },
      dto.idempotencyKey,
    );
    return this.investmentRepository.createOrder({
      userId,
      accountId: account.id,
      productId: product.id,
      idempotencyKey: dto.idempotencyKey,
      providerOrderId: execution.providerReference,
      type: dto.type,
      amount: dto.amount,
      currency: product.currency,
      status: this.mapOrderStatus(execution.status),
      providerPayload: execution.data,
    });
  }

  listFunding(userId: string) {
    return this.investmentRepository.findFunding(userId);
  }

  deposit(userId: string, dto: InvestmentFundingDto) {
    return this.createFunding(userId, dto, InvestmentFundingType.DEPOSIT);
  }

  withdraw(userId: string, dto: InvestmentFundingDto) {
    return this.createFunding(userId, dto, InvestmentFundingType.WITHDRAWAL);
  }

  async applyProviderPortfolioSnapshot(
    userId: string,
    snapshots: Array<{
      providerProductId: string;
      providerPositionId?: string | null;
      units: string;
      investedAmount: string;
      currentValue: string;
      status?: InvestmentPositionStatus;
      providerPayload?: Record<string, unknown> | null;
    }>,
  ) {
    const account = await this.requireAccount(userId);
    for (const snapshot of snapshots) {
      this.toAtomicUnits(snapshot.units);
      this.toAtomicUnits(snapshot.investedAmount);
      this.toAtomicUnits(snapshot.currentValue);
      const product = await this.investmentRepository.findProductByProviderId(
        snapshot.providerProductId,
      );
      if (!product) {
        throw new NotFoundException(
          `Investment product ${snapshot.providerProductId} is not synchronized.`,
        );
      }
      const unrealizedReturn = this.subtractDecimals(
        snapshot.currentValue,
        snapshot.investedAmount,
      );
      await this.investmentRepository.upsertPosition({
        userId,
        accountId: account.id,
        productId: product.id,
        providerPositionId: snapshot.providerPositionId ?? null,
        units: snapshot.units,
        investedAmount: snapshot.investedAmount,
        currentValue: snapshot.currentValue,
        unrealizedReturn,
        status: snapshot.status ?? InvestmentPositionStatus.ACTIVE,
        providerUpdatedAt: new Date(),
        providerPayload: snapshot.providerPayload ?? null,
      });
    }
    return this.getPortfolio(userId);
  }

  private async createFunding(
    userId: string,
    dto: InvestmentFundingDto,
    type: InvestmentFundingType,
  ) {
    const existing = await this.investmentRepository.findFundingByIdempotency(
      userId,
      dto.idempotencyKey,
    );
    if (existing) {
      return existing;
    }
    const account = await this.requireActiveAccount(userId);
    this.assertProviderReady('orders');
    const execution = await this.providerGateway.execute(
      type === InvestmentFundingType.DEPOSIT ? 'deposit' : 'withdrawal',
      {
        accountId: account.providerAccountId,
        amount: dto.amount,
        currency: account.currency,
      },
      dto.idempotencyKey,
    );
    return this.investmentRepository.createFunding({
      userId,
      accountId: account.id,
      idempotencyKey: dto.idempotencyKey,
      type,
      amount: dto.amount,
      currency: account.currency,
      providerReference: execution.providerReference,
      status: this.mapFundingStatus(execution.status),
      providerPayload: execution.data,
    });
  }

  private async requireAccount(userId: string) {
    const account = await this.investmentRepository.findAccount(userId);
    if (!account) {
      throw new NotFoundException('Investment account has not been opened.');
    }
    return account;
  }

  private async requireActiveAccount(userId: string) {
    const account = await this.requireAccount(userId);
    const user = await this.userRepository.getUserById(userId);
    if (!this.isKycVerified(user)) {
      throw new PreconditionFailedException(
        'Verified KYC is required for investment activity.',
      );
    }
    if (user.status !== AccountStatus.ACTIVE) {
      throw new PreconditionFailedException(
        'An active Vidal Pay account is required for investment activity.',
      );
    }
    this.assertSupportedRegion(this.resolveUserRegion(user));
    if (account.status !== InvestmentAccountStatus.ACTIVE) {
      throw new ConflictException(
        'Investment account is not active with the provider.',
      );
    }
    return account;
  }

  private isKycVerified(user: any) {
    return (
      user.kyc?.status === KycStatus.VERIFIED ||
      user.kycStatus === KycStatus.VERIFIED
    );
  }

  private assertSupportedRegion(region: SupportedRegion | null) {
    if (region !== SupportedRegion.NG) {
      throw new BadRequestException(
        'Cowrywise investment products are currently available to Nigerian accounts only.',
      );
    }
  }

  private resolveUserRegion(user: any): SupportedRegion | null {
    if (user.signupRegion === SupportedRegion.NG) {
      return SupportedRegion.NG;
    }
    if (user.signupRegion === SupportedRegion.US) {
      return SupportedRegion.US;
    }
    const countryCode = String(
      user.kyc?.countryCode ?? user.countryCode ?? '',
    ).toUpperCase();
    return countryCode === 'NG'
      ? SupportedRegion.NG
      : countryCode === 'US'
        ? SupportedRegion.US
        : null;
  }

  private getProviderStatus() {
    const provider = this.providerStatusService
      .getProviderStatuses()
      .find((candidate) => candidate.provider === 'Cowrywise');
    if (!provider) {
      throw new ServiceUnavailableException(
        'Cowrywise provider status is unavailable.',
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
        `Investment ${capability} is unavailable until Cowrywise is certified.`,
      );
    }
  }

  private serializePortfolio(positions: InvestmentPosition[]) {
    const valued = positions.every(
      (position) => position.currentValue !== null,
    );
    return {
      currency: 'NGN',
      valuationStatus: valued ? 'CURRENT' : 'AWAITING_PROVIDER_SNAPSHOT',
      totalInvested: positions.reduce(
        (total, position) => this.addDecimals(total, position.investedAmount),
        '0',
      ),
      totalValue: valued
        ? positions.reduce(
            (total, position) =>
              this.addDecimals(total, position.currentValue ?? '0'),
            '0',
          )
        : null,
      positions,
    };
  }

  private mapOrderStatus(status: string): InvestmentOrderStatus {
    const normalized = status.toUpperCase();
    return Object.values(InvestmentOrderStatus).includes(
      normalized as InvestmentOrderStatus,
    )
      ? (normalized as InvestmentOrderStatus)
      : InvestmentOrderStatus.SUBMITTED;
  }

  private mapFundingStatus(status: string): InvestmentFundingStatus {
    const normalized = status.toUpperCase();
    return Object.values(InvestmentFundingStatus).includes(
      normalized as InvestmentFundingStatus,
    )
      ? (normalized as InvestmentFundingStatus)
      : InvestmentFundingStatus.SUBMITTED;
  }

  private mapRiskLevel(value: string | null): InvestmentRiskLevel {
    const normalized = value?.toUpperCase();
    return Object.values(InvestmentRiskLevel).includes(
      normalized as InvestmentRiskLevel,
    )
      ? (normalized as InvestmentRiskLevel)
      : InvestmentRiskLevel.MEDIUM;
  }

  private toAtomicUnits(value: string): bigint {
    if (!/^\d+(?:\.\d{1,18})?$/.test(String(value))) {
      throw new BadRequestException('Invalid investment decimal amount.');
    }
    const [whole, fraction = ''] = String(value).split('.');
    return BigInt(`${whole}${fraction.padEnd(18, '0').slice(0, 18)}`);
  }

  private addDecimals(left: string, right: string) {
    return this.fromAtomicUnits(
      this.toAtomicUnits(left) + this.toAtomicUnits(right),
    );
  }

  private subtractDecimals(left: string, right: string) {
    return this.fromAtomicUnits(
      this.toAtomicUnits(left) - this.toAtomicUnits(right),
    );
  }

  private fromAtomicUnits(value: bigint) {
    const negative = value < 0n;
    const raw = (negative ? -value : value).toString().padStart(19, '0');
    const whole = raw.slice(0, -18);
    const fraction = raw.slice(-18).replace(/0+$/, '');
    return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
  }

  private pickString(data: Record<string, unknown>, key: string) {
    const value = data[key];
    return typeof value === 'string' && value.trim() ? value : null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private safeErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Provider request failed.';
  }
}
