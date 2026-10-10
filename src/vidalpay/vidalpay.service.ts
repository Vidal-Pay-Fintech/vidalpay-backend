import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { compare } from 'bcrypt';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Beneficiary } from 'src/database/entities/beneficiary.entity';
import { Card } from 'src/database/entities/card.entity';
import { Dispute } from 'src/database/entities/dispute.entity';
import { FinancialTransaction } from 'src/database/entities/financial-transaction.entity';
import { FincraWebhookEvent } from 'src/database/entities/fincra-webhook-event.entity';
import { KycProfile } from 'src/database/entities/kyc-profile.entity';
import { Notification } from 'src/database/entities/notification.entity';
import { NotificationDevice } from 'src/database/entities/notification-device.entity';
import { NotificationPreference } from 'src/database/entities/notification-preference.entity';
import { ProviderOperation } from 'src/database/entities/provider-operation.entity';
import { ReferralEvent } from 'src/database/entities/referral-event.entity';
import { RewardLedgerEntry } from 'src/database/entities/reward-ledger-entry.entity';
import { SupportTicket } from 'src/database/entities/support-ticket.entity';
import { Token } from 'src/database/entities/token.entity';
import { AccountStatus, User } from 'src/database/entities/user.entity';
import { Wallet } from 'src/database/entities/wallet.entity';
import { TokenType } from 'src/common/enum/token-type.enum';
import { MailService } from 'src/mail/mail.service';
import { Currency } from 'src/utils/enums/wallet.enum';
import { TagIdGenerator } from 'src/utils/tagIdGenerator';
import {
  BlockedResponse,
  createBlockedResponse,
  ProviderCapability,
} from './contracts';
import { ProviderStatusService } from './provider-status.service';
import { FincraSandboxService } from './fincra-sandbox.service';
import {
  FincraVirtualAccountRequestPayload,
  FincraWalletService,
} from './fincra-wallet.service';
import {
  ProductCode,
  ProductEligibilityService,
} from './product-eligibility.service';
import { SandboxProviderService } from './sandbox-provider.service';
import {
  WalletProduct,
  WalletProductCatalogService,
  WalletProductRequirement,
} from './wallet-product-catalog.service';

type AnyRecord = Record<string, unknown>;

const supportedCurrencies = [
  Currency.NGN,
  Currency.USD,
  Currency.GBP,
  Currency.CAD,
] as const;
const fxCurrencies = ['NGN', 'USD', 'GBP', 'CAD'] as const;

@Injectable()
export class VidalpayService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(KycProfile)
    private readonly kycProfileRepository: Repository<KycProfile>,
    @InjectRepository(FinancialTransaction)
    private readonly transactionRepository: Repository<FinancialTransaction>,
    @InjectRepository(ProviderOperation)
    private readonly providerOperationRepository: Repository<ProviderOperation>,
    @InjectRepository(FincraWebhookEvent)
    private readonly fincraWebhookEventRepository: Repository<FincraWebhookEvent>,
    @InjectRepository(RewardLedgerEntry)
    private readonly rewardLedgerRepository: Repository<RewardLedgerEntry>,
    @InjectRepository(ReferralEvent)
    private readonly referralEventRepository: Repository<ReferralEvent>,
    @InjectRepository(Card)
    private readonly cardRepository: Repository<Card>,
    @InjectRepository(Beneficiary)
    private readonly beneficiaryRepository: Repository<Beneficiary>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(NotificationPreference)
    private readonly notificationPreferenceRepository: Repository<NotificationPreference>,
    @InjectRepository(NotificationDevice)
    private readonly notificationDeviceRepository: Repository<NotificationDevice>,
    @InjectRepository(SupportTicket)
    private readonly supportTicketRepository: Repository<SupportTicket>,
    @InjectRepository(Token)
    private readonly tokenRepository: Repository<Token>,
    @InjectRepository(Dispute)
    private readonly disputeRepository: Repository<Dispute>,
    private readonly providerStatusService: ProviderStatusService,
    private readonly fincraSandboxService: FincraSandboxService,
    private readonly fincraWalletService: FincraWalletService,
    private readonly productEligibilityService: ProductEligibilityService,
    private readonly walletProductCatalogService: WalletProductCatalogService,
    private readonly sandboxProviderService: SandboxProviderService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly dataSource: DataSource,
  ) {}

  async getProviderStatuses() {
    return {
      providers: this.providerStatusService.getStatuses(),
    };
  }

  async probeFincraSandbox() {
    return this.fincraSandboxService.probeReadOnly();
  }

  async getProductCapabilities(userId: string) {
    const user = await this.findUser(userId);
    return this.productEligibilityService.capabilities(user);
  }

  async getCurrentUser(userId: string) {
    const user = await this.findUser(userId);
    await this.ensureLegacyUserTag(user);
    await this.ensureCustomerWallets(user.id);
    const [wallets, kyc] = await Promise.all([
      this.walletRepository.find({
        where: { userId: user.id },
        order: { currency: 'ASC' },
      }),
      this.getKycProfileForSession(user),
    ]);

    return this.normalizeUser(user, wallets, kyc);
  }

  async getHomeOverview(userId: string) {
    const user = await this.findUser(userId);
    const kyc = await this.getKycProfileForSession(user);
    return {
      promotions: [],
      pendingActions: this.buildPendingActions(user, kyc),
      exchangeRates: await this.getFxRates(userId),
    };
  }

  async getSecurityOverview(userId: string) {
    const user = await this.findUser(userId);
    return this.buildSecurityOverview(user);
  }

  async getAccountLevel(userId: string) {
    const user = await this.findUser(userId);
    const kyc = await this.getKycProfileSnapshot(user);
    return this.buildAccountLevel(user, kyc);
  }

  async getAccountLimits(userId: string) {
    const user = await this.findUser(userId);
    const kyc = await this.getKycProfileForSession(user);
    const accountLevel = this.buildAccountLevel(user, kyc);
    return {
      accountLevel,
      limits: kyc.limits ?? this.defaultLimits(kyc.status),
      providerLimits: {
        unit: null,
        payvessel: null,
      },
      message:
        'Amount limits are exposed from backend policy. Provider-specific limits remain null until Unit.co and PayVessel account/card provisioning is live-tested.',
    };
  }

  async updateProfile(userId: string, payload: AnyRecord) {
    const user = await this.findUser(userId);
    const allowedFields: Array<keyof User> = [
      'firstName',
      'lastName',
      'phoneNumber',
      'dateOfBirth',
      'profilePicture',
      'country',
      'countryCode',
      'residency',
      'region',
    ];
    const update: Record<string, unknown> = {};

    allowedFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(payload, field)) {
        update[field] = payload[field];
      }
    });

    if (Object.keys(update).length === 0) {
      return this.getCurrentUser(user.id);
    }

    const profilePicture = this.asString(update.profilePicture);
    if (
      profilePicture?.startsWith('file://') ||
      profilePicture?.startsWith('content://')
    ) {
      throw new ServiceUnavailableException(
        createBlockedResponse({
          code: 'PROFILE_IMAGE_STORAGE_UNAVAILABLE',
          feature: 'profile_picture_upload',
          capability: 'profile_picture_storage',
          provider: 'VidalPay',
          reason:
            'A device-local image URI cannot be shared across devices. Configure backend object storage before accepting photo uploads.',
          missingRequirements: ['PROFILE_IMAGE_STORAGE_PROVIDER'],
          retryable: false,
        }),
      );
    }

    await this.userRepository.update(
      user.id,
      update as QueryDeepPartialEntity<User>,
    );
    return this.getCurrentUser(user.id);
  }

  async requestEmailChange(userId: string, newEmail: string) {
    if (!newEmail) {
      throw new BadRequestException('newEmail is required');
    }
    const user = await this.findUser(userId);
    const existing = await this.userRepository.findOne({
      where: { email: newEmail },
    });
    if (existing && existing.id !== user.id) {
      throw new BadRequestException('Email is already in use');
    }
    await this.userRepository.update(user.id, { pendingEmail: newEmail });
    const token = await this.createOtpToken(user, TokenType.CHANGE_EMAIL);
    await this.mailService.sendEmailVerificationCode(user.id, token.token);
    return {
      message: 'Email change requested. Verify the OTP sent by the backend.',
      delivery: 'EMAIL',
    };
  }

  async verifyEmailChange(userId: string, token: string) {
    const user = await this.findUser(userId);
    if (!user.pendingEmail) {
      throw new BadRequestException('No pending email change found');
    }
    const tokenEntity = await this.validateOtpToken(
      userId,
      token,
      TokenType.CHANGE_EMAIL,
    );
    await this.userRepository.update(user.id, {
      email: user.pendingEmail,
      pendingEmail: () => 'NULL',
      isVerified: false,
    });
    await this.tokenRepository.delete(tokenEntity.id);
    return {
      message: 'Email changed. Please verify the new email before next login.',
    };
  }

  async requestPhoneChange(userId: string, newPhoneNumber: string) {
    if (!newPhoneNumber) {
      throw new BadRequestException('newPhoneNumber is required');
    }
    const user = await this.findUser(userId);
    await this.userRepository.update(user.id, {
      pendingPhoneNumber: newPhoneNumber,
    });
    const token = await this.createOtpToken(user, TokenType.CHANGE_PHONE);
    await this.mailService.sendEmailVerificationCode(user.id, token.token);
    return {
      message: 'Phone change requested. Verify the OTP sent by the backend.',
      delivery: 'EMAIL',
    };
  }

  async verifyPhoneChange(userId: string, token: string) {
    const user = await this.findUser(userId);
    if (!user.pendingPhoneNumber) {
      throw new BadRequestException('No pending phone change found');
    }
    const tokenEntity = await this.validateOtpToken(
      userId,
      token,
      TokenType.CHANGE_PHONE,
    );
    await this.userRepository.update(user.id, {
      phoneNumber: user.pendingPhoneNumber,
      pendingPhoneNumber: () => 'NULL',
      isPhoneVerified: false,
    });
    await this.tokenRepository.delete(tokenEntity.id);
    return {
      message: 'Phone number changed. Please verify the new phone number.',
    };
  }

  async closeAccount(userId: string, payload: AnyRecord) {
    const user = await this.findUser(userId);
    const password = this.asString(payload.password);
    if (!password) {
      throw new BadRequestException('password is required');
    }
    const validPassword = await compare(password, user.password);
    if (!validPassword) {
      throw new UnauthorizedException('Invalid password');
    }
    await this.userRepository.update(user.id, {
      status: AccountStatus.DEACTIVATED,
    });
    return {
      closed: true,
      status: AccountStatus.DEACTIVATED,
      message: 'Account closure completed. The account is now deactivated.',
    };
  }

  async requestAccountDeletion(userId: string, payload: AnyRecord) {
    await this.findUser(userId);
    throw new ServiceUnavailableException(
      createBlockedResponse({
        code: 'ACCOUNT_DELETION_UNAVAILABLE',
        feature: 'account_deletion',
        capability: 'account_deletion',
        provider: 'VidalPay',
        reason:
          'Permanent account deletion requires a retention, financial-record, and provider-offboarding policy before it can be safely executed.',
        missingRequirements: [
          'account_deletion_policy',
          'provider_offboarding_flow',
          'financial_record_retention_review',
        ],
        retryable: false,
      }),
    );
  }

  async listScheduledTransfers(userId: string) {
    await this.findUser(userId);
    return {
      enabled: false,
      scheduledTransfers: [],
      message:
        'Scheduled transfers are unavailable because no scheduler, debit authorization, or provider execution job is implemented.',
    };
  }

  async createScheduledTransfer(userId: string, payload: AnyRecord) {
    await this.recordBlockedOperation(userId, 'scheduled_transfer', payload, {
      provider: 'VidalPay',
      capability: 'bank_transfer',
      reason:
        'Scheduled transfers require a durable scheduler, transaction PIN authorization, and execution/retry jobs before money movement can be queued.',
    });
  }

  async getWallets(userId: string) {
    const user = await this.findUser(userId);
    const wallets = await this.ensureCustomerWallets(userId);
    const defaultCurrency = this.defaultCurrencyForRegion(
      this.inferRegion(user),
    );
    const orderedWallets = this.orderWalletsByDefault(wallets, defaultCurrency);
    return {
      wallets: orderedWallets.map((wallet) => this.normalizeWallet(wallet)),
    };
  }

  async getAvailableWalletProducts(userId: string) {
    const user = await this.findUser(userId);
    const jurisdiction =
      this.productEligibilityService.capabilities(user).jurisdiction;
    const [wallets, products] = await Promise.all([
      this.walletRepository.find({ where: { userId } }),
      Promise.resolve(
        this.walletProductCatalogService.compatibleProducts(
          jurisdiction.jurisdiction,
        ),
      ),
    ]);

    const available = await Promise.all(
      products.map(async (product) => {
        const eligibility = await this.evaluateWalletEligibility(
          user,
          product.currency,
          wallets,
        );
        return eligibility.available && eligibility.canRequest
          ? eligibility.product
          : null;
      }),
    );

    return {
      jurisdiction,
      products: available.filter(
        (product): product is NonNullable<typeof product> => Boolean(product),
      ),
    };
  }

  async getWalletEligibility(userId: string, currency: string) {
    const user = await this.findUser(userId);
    return this.evaluateWalletEligibility(user, currency);
  }

  async activateWalletProduct(
    userId: string,
    currency: string,
    payload: AnyRecord = {},
  ) {
    const user = await this.findUser(userId);
    const eligibility = await this.evaluateWalletEligibility(user, currency);
    const activationKey = this.walletActivationIdempotencyKey(
      userId,
      eligibility.currency,
    );

    if (eligibility.status === 'ACTIVE') {
      return {
        ...eligibility,
        activation: {
          status: 'ALREADY_ACTIVE',
          reference: null,
          message: 'This wallet is already active for the customer.',
        },
      };
    }

    if (eligibility.status === 'PENDING') {
      return {
        ...eligibility,
        activation: {
          status: 'PENDING',
          reference: eligibility.pendingActivation?.reference ?? null,
          message:
            'A wallet activation request is already pending for this currency.',
        },
      };
    }

    if (!eligibility.eligible) {
      return {
        ...eligibility,
        activation: {
          status: eligibility.status,
          reference: null,
          message: eligibility.reason,
        },
      };
    }

    const rawProduct = this.walletProductCatalogService.find(
      eligibility.currency,
    );
    if (!rawProduct) {
      return {
        ...eligibility,
        activation: {
          status: eligibility.status,
          reference: null,
          message: eligibility.reason,
        },
      };
    }

    const provider =
      this.walletProductCatalogService.providerConfigured(rawProduct);
    const existing = await this.providerOperationRepository.findOne({
      where: {
        userId,
        type: 'wallet_activation',
        idempotencyKey: activationKey,
      },
    });
    if (existing) {
      return {
        ...eligibility,
        status: existing.status === 'PENDING' ? 'PENDING' : eligibility.status,
        activation: {
          status: existing.status,
          reference: existing.reference,
          message:
            existing.status === 'PENDING'
              ? 'A wallet activation request is already pending for this currency.'
              : existing.failureReason,
        },
      };
    }

    if (!provider.configured) {
      const blocked = provider.blockedResponse;
      const operation = await this.providerOperationRepository.save(
        this.providerOperationRepository.create({
          userId,
          type: 'wallet_activation',
          idempotencyKey: activationKey,
          reference: activationKey,
          status: 'BLOCKED',
          amount: null,
          currency: eligibility.currency,
          provider: 'FINCRA',
          requestPayload: this.redactPayload(payload),
          responsePayload: null,
          errorCode: blocked.code,
          failureReason: blocked.message,
          metadata: { blocked, product: eligibility.product },
        }),
      );
      return {
        ...eligibility,
        available: true,
        eligible: false,
        status: 'PROVIDER_NOT_CONFIGURED',
        reason: blocked.reason,
        missingRequirements: [
          ...eligibility.missingRequirements,
          ...provider.missingRequirements,
        ],
        activation: {
          status: operation.status,
          reference: operation.reference,
          message: blocked.message,
        },
      };
    }

    const fincraRequest = this.buildFincraVirtualAccountRequest(
      user,
      rawProduct,
      payload,
      activationKey,
    );
    const operation = await this.providerOperationRepository.save(
      this.providerOperationRepository.create({
        userId,
        type: 'wallet_activation',
        idempotencyKey: activationKey,
        reference: activationKey,
        status: 'SUBMITTING',
        amount: null,
        currency: eligibility.currency,
        provider: 'FINCRA',
        requestPayload: this.safeFincraActivationAuditPayload(fincraRequest),
        responsePayload: null,
        errorCode: null,
        failureReason: null,
        metadata: {
          product: eligibility.product,
          providerRequestStatus: 'SUBMITTING',
        },
      }),
    );

    try {
      const result =
        await this.fincraWalletService.requestPermanentVirtualAccount(
          fincraRequest,
        );
      operation.status = 'PENDING';
      operation.providerReference = result.providerReference;
      operation.responsePayload =
        this.safeFincraActivationResponsePayload(result);
      operation.metadata = {
        ...(operation.metadata ?? {}),
        providerRequestStatus: result.requestStatus,
        providerHttpStatus: result.status,
      };
      const saved = await this.providerOperationRepository.save(operation);
      return {
        ...eligibility,
        available: false,
        eligible: false,
        status: 'PENDING',
        reason:
          'A Fincra sandbox virtual account request has been submitted and is pending provider completion.',
        pendingActivation: this.normalizeProviderOperation(saved),
        activation: {
          status: saved.status,
          reference: saved.reference,
          providerReference: saved.providerReference,
          providerStatus: result.requestStatus,
          message:
            'Fincra sandbox wallet activation request submitted. No account number will be shown until Fincra returns real account details.',
        },
      };
    } catch (error) {
      const failure = this.asRecord(
        (error as { response?: { message?: unknown } })?.response?.message,
      );
      const retryable = failure?.retryable === true;
      operation.status = retryable ? 'AMBIGUOUS_PROVIDER_STATE' : 'FAILED';
      operation.errorCode =
        this.asString(failure?.code) ?? 'FINCRA_VIRTUAL_ACCOUNT_REQUEST_FAILED';
      operation.failureReason =
        this.asString(failure?.message) ??
        'Fincra virtual account request failed.';
      operation.responsePayload = failure ?? {
        message: operation.failureReason,
      };
      operation.metadata = {
        ...(operation.metadata ?? {}),
        providerRequestStatus: operation.status,
        retryable,
        reconciliationRequired: retryable,
      };
      await this.providerOperationRepository.save(operation);
      return {
        ...eligibility,
        available: true,
        eligible: false,
        status: 'PROVIDER_REQUEST_FAILED',
        reason: operation.failureReason,
        activation: {
          status: operation.status,
          reference: operation.reference,
          message: operation.failureReason,
        },
      };
    }
  }

  async getWalletByCurrency(userId: string, currency: Currency | string) {
    await this.findUser(userId);
    const normalizedCurrency = this.normalizeCurrency(currency);
    const wallet = await this.ensureWallet(userId, normalizedCurrency);
    return this.normalizeWallet(wallet);
  }

  async getWalletAccountDetails(userId: string, currency: Currency | string) {
    const normalizedCurrency = this.normalizeCurrency(currency);
    const wallet = await this.ensureWallet(userId, normalizedCurrency);
    const normalized = this.normalizeWallet(wallet);

    if (!wallet.accountNumber) {
      return {
        accountDetails: {
          accountName: normalized.accountName,
          accountNumber: normalized.accountNumber,
          bankName: normalized.bankName,
          currency: normalizedCurrency,
          provider: normalized.provider,
          providerStatus:
            normalized.providerStatus ??
            this.providerReadinessForCurrency(normalizedCurrency),
          isProvisioned: false,
          message:
            normalizedCurrency === Currency.NGN
              ? 'NGN account details require PayVessel virtual-account provisioning.'
              : normalizedCurrency === Currency.USD
                ? 'USD account details require Unit deposit-account provisioning.'
                : `${normalizedCurrency} account details require Fincra wallet activation or provider provisioning.`,
        },
        wallet: normalized,
      };
    }

    return {
      accountDetails: {
        accountName: normalized.accountName,
        accountNumber: normalized.accountNumber,
        bankName: normalized.bankName,
        routingNumber: normalized.routingNumber,
        currency: normalizedCurrency,
        provider: normalized.provider,
        providerStatus: normalized.providerStatus,
        isProvisioned: true,
        message: null,
      },
      wallet: normalized,
    };
  }

  async getBankCatalog() {
    const ngnStatus = this.providerStatusService.getStatus('bank_transfer');
    if (!ngnStatus.enabled) {
      return {
        provider: ngnStatus.provider,
        source: 'PROVIDER_UNAVAILABLE',
        message: ngnStatus.failureReason,
        banks: [],
        items: [],
      };
    }

    return {
      provider: ngnStatus.provider,
      source: 'PROVIDER_CONFIGURED_NOT_LIVE_TESTED',
      message:
        'Bank catalog retrieval is configured for the provider adapter but has not been live-tested in this environment.',
      banks: [],
      items: [],
    };
  }

  async resolveExternalTransfer(userId: string, payload: AnyRecord) {
    await this.findUser(userId);
    const currency = this.normalizeCurrency(payload.currency);
    const capability =
      currency === Currency.USD
        ? 'usd_account_details'
        : currency === Currency.NGN
          ? 'bank_transfer'
          : 'wallet_activation';
    this.throwProviderUnavailable({
      feature: 'External transfer resolution',
      capability,
      provider:
        currency === Currency.USD
          ? 'Unit.co'
          : currency === Currency.NGN
            ? 'PayVessel'
            : 'Fincra',
      reason:
        currency === Currency.NGN || currency === Currency.USD
          ? 'External account resolution requires a live provider integration and credentials.'
          : `${currency} external account resolution and payouts require a live-tested Fincra payout/transfer integration.`,
      missingRequirements:
        this.providerStatusService.getStatus(capability).missingEnvVars,
    });
  }

  async externalTransfer(userId: string, payload: AnyRecord) {
    const currency = this.normalizeCurrency(payload.currency);
    await this.recordBlockedOperation(userId, 'external_transfer', payload, {
      provider:
        currency === Currency.USD
          ? 'Unit.co'
          : currency === Currency.NGN
            ? 'PayVessel'
            : 'Fincra',
      capability:
        currency === Currency.NGN ? 'bank_transfer' : 'wallet_activation',
      reason:
        currency === Currency.NGN || currency === Currency.USD
          ? 'External transfers must be executed by Unit.co or PayVessel; no live-tested provider path is configured.'
          : `${currency} external transfers require a live-tested Fincra payout/transfer integration before funds can leave the wallet.`,
    });
  }

  async createCardTopUpIntent(userId: string, payload: AnyRecord) {
    await this.recordBlockedOperation(userId, 'card_topup', payload, {
      provider: 'Card top-up provider',
      capability: 'card_topup',
      reason:
        'Card top-up requires a configured payment processor webhook flow.',
    });
  }

  async getCardTopUpStatus(userId: string, reference: string) {
    await this.findUser(userId);
    const operation = await this.providerOperationRepository.findOne({
      where: { userId, reference },
    });

    if (!operation) {
      throw new NotFoundException('Top-up reference not found');
    }

    return this.normalizeOperation(operation);
  }

  async getCatalog(userId: string, kind: 'airtime' | 'data' | 'utilities') {
    const user = await this.findUser(userId);
    if (this.inferRegion(user) !== 'NG') {
      const empty =
        kind === 'utilities' ? { categories: [] } : { networks: [] };
      return {
        region: this.inferRegion(user),
        provider: 'PayVessel',
        source: 'UNAVAILABLE_FOR_ACCOUNT_REGION',
        message:
          'Airtime, data, and bill payments are currently available only to Nigeria-based accounts.',
        ...empty,
      };
    }

    const capabilityByKind: Record<typeof kind, ProviderCapability> = {
      airtime: 'airtime_catalog',
      data: 'data_catalog',
      utilities: 'utilities_catalog',
    };
    const vtuCapabilityByKind: Record<typeof kind, ProviderCapability> = {
      airtime: 'vtu_catalog',
      data: 'vtu_catalog',
      utilities: 'vtu_catalog',
    };
    const vtuStatus = this.providerStatusService.getStatus(
      vtuCapabilityByKind[kind],
    );
    if (vtuStatus.enabled) {
      try {
        const catalog = await this.sandboxProviderService.getVtuNgCatalog(
          kind,
          undefined,
        );
        return {
          region: 'NG',
          provider: 'VTU.ng',
          source: 'PROVIDER_SANDBOX',
          ...this.normalizeVtuNgCatalog(kind, catalog),
        };
      } catch (error) {
        return {
          region: 'NG',
          provider: 'VTU.ng',
          source: 'PROVIDER_SANDBOX_ERROR',
          message: this.providerErrorMessage(error),
          ...(kind === 'utilities' ? { categories: [] } : { networks: [] }),
        };
      }
    }

    const status = this.providerStatusService.getStatus(capabilityByKind[kind]);
    if (
      this.configService.get<string>('RELOADLY_CLIENT_ID') &&
      this.configService.get<string>('RELOADLY_CLIENT_SECRET')
    ) {
      try {
        const catalog =
          await this.sandboxProviderService.getReloadlyCatalog(kind);
        return {
          region: 'NG',
          provider: 'Reloadly',
          source: 'PROVIDER_SANDBOX',
          ...this.normalizeReloadlyCatalog(kind, catalog),
        };
      } catch (error) {
        return {
          region: 'NG',
          provider: 'Reloadly',
          source: 'PROVIDER_SANDBOX_ERROR',
          message: this.providerErrorMessage(error),
          ...(kind === 'utilities' ? { categories: [] } : { networks: [] }),
        };
      }
    }

    const base = {
      region: 'NG',
      provider: status.provider,
      source: status.enabled
        ? 'PROVIDER_CONFIGURED_NOT_LIVE_TESTED'
        : 'PROVIDER_UNAVAILABLE',
      message:
        status.failureReason ??
        'Provider credentials are configured, but catalog retrieval has not been live-tested in this environment.',
    };

    if (kind === 'utilities') {
      return { ...base, categories: [] };
    }

    return { ...base, networks: [] };
  }

  async validateUtilityCustomer(userId: string, payload: AnyRecord) {
    const user = await this.findUser(userId);
    if (this.inferRegion(user) !== 'NG') {
      this.throwProviderUnavailable({
        feature: 'Utility customer validation',
        capability: 'utilities_validate',
        provider: 'PayVessel',
        reason:
          'Utility validation is available only for Nigeria-based accounts.',
      });
    }
    const vtuStatus = this.providerStatusService.getStatus('vtu_validate');
    if (vtuStatus.enabled) {
      try {
        return {
          provider: 'VTU.ng',
          status: 'VALIDATED',
          result: await this.sandboxProviderService.validateVtuNgCustomer(
            this.toVtuNgValidationPayload(payload),
          ),
        };
      } catch (error) {
        throw new ServiceUnavailableException(
          createBlockedResponse({
            code: 'PROVIDER_REQUEST_FAILED',
            feature: 'Utility customer validation',
            capability: 'vtu_validate',
            provider: 'VTU.ng',
            reason: this.providerErrorMessage(error),
            retryable: true,
          }),
        );
      }
    }
    if (
      this.configService.get<string>('RELOADLY_CLIENT_ID') &&
      this.configService.get<string>('RELOADLY_CLIENT_SECRET')
    ) {
      try {
        return {
          provider: 'Reloadly',
          status: 'VALIDATED',
          result:
            await this.sandboxProviderService.validateReloadlyUtility(payload),
        };
      } catch (error) {
        throw new ServiceUnavailableException(
          createBlockedResponse({
            code: 'PROVIDER_REQUEST_FAILED',
            feature: 'Utility customer validation',
            capability: 'utilities_validate',
            provider: 'Reloadly',
            reason: this.providerErrorMessage(error),
            retryable: true,
          }),
        );
      }
    }
    this.throwProviderUnavailable({
      feature: 'Utility customer validation',
      capability: 'utilities_validate',
      provider: 'PayVessel',
      reason:
        'Utility validation must be confirmed by PayVessel before payment.',
      missingRequirements:
        this.providerStatusService.getStatus('utilities_validate')
          .missingEnvVars,
    });
  }

  async purchaseService(
    userId: string,
    type: 'airtime' | 'data' | 'utilities',
    payload: AnyRecord,
  ) {
    const capabilityByKind: Record<typeof type, ProviderCapability> = {
      airtime: 'airtime_purchase',
      data: 'data_purchase',
      utilities: 'utilities_payment',
    };
    const vtuCapability: ProviderCapability = 'vtu_purchase';
    const user = await this.findUser(userId);
    if (this.inferRegion(user) !== 'NG') {
      await this.recordBlockedOperation(userId, type, payload, {
        provider: 'PayVessel',
        capability: capabilityByKind[type],
        reason:
          'Airtime, data, and bill payments are available only for Nigeria-based accounts and use the NGN wallet.',
      });
    }
    if (
      payload.currency !== undefined &&
      this.normalizeCurrency(payload.currency) !== Currency.NGN
    ) {
      throw new BadRequestException(
        'Airtime, data, and bill payments must use the NGN wallet',
      );
    }
    const pin = this.asString(payload.transactionPin ?? payload.pin);
    if (!pin) throw new BadRequestException('transactionPin is required');
    await this.assertTransactionPin(userId, pin);
    const idempotencyKey =
      this.asString(payload.idempotencyKey) ?? this.asString(payload.reference);
    if (!idempotencyKey) {
      throw new BadRequestException('idempotencyKey is required');
    }
    const existing = await this.providerOperationRepository.findOne({
      where: { userId, type, idempotencyKey },
    });
    if (existing) return this.normalizeOperation(existing);

    const vtuStatus = this.providerStatusService.getStatus(vtuCapability);
    if (vtuStatus.enabled) {
      const operation = await this.providerOperationRepository.save(
        this.providerOperationRepository.create({
          userId,
          type,
          idempotencyKey,
          reference: idempotencyKey,
          status: 'PENDING',
          amount: this.normalizeAmount(payload.amount),
          currency: Currency.NGN,
          provider: 'VTU.ng',
          requestPayload: this.redactPayload(payload),
          responsePayload: null,
          errorCode: null,
          failureReason: null,
          metadata: {
            sandbox: true,
            settlement: 'AWAITING_REQUERY_OR_WEBHOOK',
          },
        }),
      );
      try {
        const providerPayload = this.toVtuNgPurchasePayload(
          type,
          payload,
          idempotencyKey,
        );
        const response = await this.sandboxProviderService.purchaseVtuNg(
          type,
          providerPayload,
        );
        operation.status = 'SUBMITTED';
        operation.providerReference =
          this.asString(response.request_id) ??
          this.asString(response.requestId) ??
          this.asString(response.reference) ??
          idempotencyKey;
        operation.responsePayload = this.redactPayload(response);
        operation.metadata = {
          ...operation.metadata,
          providerContract: 'VTU_NG_V2',
          ledgerFinalization: 'BLOCKED_UNTIL_REQUERY_OR_WEBHOOK_SUCCESS',
        };
        await this.providerOperationRepository.save(operation);
        return this.normalizeOperation(operation);
      } catch (error) {
        operation.status = 'FAILED';
        operation.errorCode = 'PROVIDER_REQUEST_FAILED';
        operation.failureReason = this.providerErrorMessage(error);
        await this.providerOperationRepository.save(operation);
        throw new ServiceUnavailableException(
          createBlockedResponse({
            code: operation.errorCode,
            feature: type,
            capability: vtuCapability,
            provider: 'VTU.ng',
            reason: operation.failureReason,
            retryable: true,
          }),
        );
      }
    }

    if (
      this.configService.get<string>('RELOADLY_CLIENT_ID') &&
      this.configService.get<string>('RELOADLY_CLIENT_SECRET')
    ) {
      const requestPayload = this.redactPayload(payload);
      const operation = await this.providerOperationRepository.save(
        this.providerOperationRepository.create({
          userId,
          type,
          idempotencyKey,
          reference: idempotencyKey,
          status: 'PENDING',
          amount: this.normalizeAmount(payload.amount),
          currency: Currency.NGN,
          provider: 'Reloadly',
          requestPayload,
          responsePayload: null,
          errorCode: null,
          failureReason: null,
          metadata: { sandbox: true },
        }),
      );
      try {
        const providerPayload = { ...payload };
        delete providerPayload.transactionPin;
        delete providerPayload.pin;
        const response = await this.sandboxProviderService.purchaseReloadly(
          type,
          providerPayload,
        );
        operation.status = 'SUBMITTED';
        operation.providerReference =
          this.asString(response.transactionId) ??
          this.asString(response.id) ??
          null;
        operation.responsePayload = this.redactPayload(response);
        await this.providerOperationRepository.save(operation);
        return this.normalizeOperation(operation);
      } catch (error) {
        operation.status = 'FAILED';
        operation.errorCode = 'PROVIDER_REQUEST_FAILED';
        operation.failureReason = this.providerErrorMessage(error);
        await this.providerOperationRepository.save(operation);
        throw new ServiceUnavailableException(
          createBlockedResponse({
            code: operation.errorCode,
            feature: type,
            capability: capabilityByKind[type],
            provider: 'Reloadly',
            reason: operation.failureReason,
            retryable: true,
          }),
        );
      }
    }
    await this.recordBlockedOperation(userId, type, payload, {
      provider: 'PayVessel',
      capability: capabilityByKind[type],
      reason:
        'NGN wallet is not debited until PayVessel confirms the bill-payment operation.',
    });
  }

  async getFxRates(userId: string) {
    await this.findUser(userId);
    const pairs = this.fxCurrencyPairs();
    const providerStatus = this.providerStatusService.getStatus('fx_quote');
    if (!this.configService.get<string>('FINCRA_API_KEY')) {
      return {
        provider: 'Fincra',
        status: 'UNAVAILABLE',
        readinessStatus: providerStatus.readinessStatus,
        baseCurrencies: [...fxCurrencies],
        quoteCurrencies: [...fxCurrencies],
        rates: [],
        missingRequirements: ['FINCRA_API_KEY'],
        message:
          'Live exchange rates require the backend Fincra sandbox API key.',
      };
    }

    try {
      const raw = await this.sandboxProviderService.getFincraRates();
      return {
        provider: 'Fincra',
        status: 'AVAILABLE',
        readinessStatus: 'CONFIGURED_NOT_LIVE_TESTED',
        baseCurrencies: [...fxCurrencies],
        quoteCurrencies: [...fxCurrencies],
        rates: this.normalizeFincraRates(raw, pairs),
        fetchedAt: new Date().toISOString(),
        source: 'FINCRA_TREASURY_RATES',
      };
    } catch (error) {
      return {
        provider: 'Fincra',
        status: 'UNAVAILABLE',
        readinessStatus: 'PROVIDER_ERROR',
        baseCurrencies: [...fxCurrencies],
        quoteCurrencies: [...fxCurrencies],
        rates: [],
        message: this.providerErrorMessage(error),
      };
    }
  }

  async getFxQuote(userId: string, payload: AnyRecord) {
    await this.findUser(userId);
    const fromCurrency = this.normalizeFxCurrency(
      payload.fromCurrency ?? payload.sourceCurrency,
    );
    const toCurrency = this.normalizeFxCurrency(
      payload.toCurrency ?? payload.destinationCurrency,
    );
    const amount = this.normalizeAmount(payload.amount);
    if (fromCurrency === toCurrency) {
      throw new BadRequestException(
        'fromCurrency and toCurrency must be different',
      );
    }
    const rates = await this.getFxRates(userId);
    const rate = this.findFxRate(rates, fromCurrency, toCurrency);
    if (!rate) {
      this.throwProviderUnavailable({
        code: 'FX_RATE_UNAVAILABLE',
        feature: 'FX quote',
        capability: 'fx_quote',
        provider: 'Fincra',
        reason:
          'Fincra did not return a usable read-only rate for this currency pair.',
        missingRequirements: [`${fromCurrency}_${toCurrency}_RATE`],
      });
    }
    const quoteId = `fx_quote_${randomUUID()}`;
    return {
      quoteId,
      provider: 'Fincra',
      executable: false,
      status: 'QUOTE_ONLY',
      fromCurrency,
      toCurrency,
      amount,
      rate: rate.rate,
      side: rate.side ?? null,
      estimatedAmount: Number((amount * Number(rate.rate)).toFixed(2)),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      message:
        'This is a read-only provider rate quote. Conversion execution remains blocked until ledger holds, settlement, and reversal handling are enabled.',
    };
  }

  async convertFx(userId: string, payload: AnyRecord) {
    await this.recordBlockedOperation(userId, 'fx_convert', payload, {
      provider: 'Fincra',
      capability: 'fx_convert',
      reason:
        'Currency conversion execution remains blocked until wallet debit holds, provider conversion settlement, reconciliation, and reversal handling are implemented.',
    });
  }

  async internalTransfer(userId: string, payload: AnyRecord) {
    const currency = this.normalizeCurrency(payload.currency);
    const amount = this.normalizeAmount(payload.amount);
    const recipientTag =
      this.asString(payload.recipientTag) ??
      this.asString(payload.tagId) ??
      this.asString(payload.tag);
    const idempotencyKey =
      this.asString(payload.idempotencyKey) ?? this.asString(payload.reference);
    const pin = this.asString(payload.pin);

    if (!recipientTag) {
      throw new BadRequestException('recipientTag is required');
    }
    if (!idempotencyKey) {
      throw new BadRequestException('idempotencyKey is required');
    }
    if (!pin) {
      throw new BadRequestException('pin is required');
    }

    let existing: ProviderOperation | null = null;
    try {
      existing = await this.providerOperationRepository.findOne({
        where: { userId, type: 'internal_transfer', idempotencyKey },
      });
    } catch (error) {
      this.throwMissingFeatureStorage(
        error,
        'internal transfers',
        'provider_operation',
      );
    }
    if (existing) {
      return this.normalizeOperation(existing);
    }

    await this.assertTransactionPin(userId, pin);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const users = manager.getRepository(User);
        const wallets = manager.getRepository(Wallet);
        const operations = manager.getRepository(ProviderOperation);
        const transactions = manager.getRepository(FinancialTransaction);

        const recipient = await this.findUserByTag(users, recipientTag);
        if (!recipient) {
          throw new NotFoundException('Recipient tag was not found');
        }
        if (recipient.id === userId) {
          throw new BadRequestException('You cannot transfer to your own tag');
        }

        // Lock both currency-specific wallet rows in deterministic user-id order.
        // This prevents concurrent retries/transfers from spending the same
        // balance and avoids opposite-direction transfers deadlocking each other.
        const walletOwners = [userId, recipient.id].sort();
        const lockedWallets = new Map<string, Wallet>();
        for (const ownerId of walletOwners) {
          const wallet = await wallets
            .createQueryBuilder('wallet')
            .setLock('pessimistic_write')
            .where('wallet.userId = :ownerId', { ownerId })
            .andWhere('wallet.currency = :currency', { currency })
            .getOne();
          if (wallet) {
            lockedWallets.set(ownerId, wallet);
          }
        }

        const operationAfterLock = await operations.findOne({
          where: { userId, type: 'internal_transfer', idempotencyKey },
        });
        if (operationAfterLock) {
          return this.normalizeOperation(operationAfterLock);
        }

        const senderWallet = lockedWallets.get(userId);
        const recipientWallet = lockedWallets.get(recipient.id);

        if (!senderWallet || !recipientWallet) {
          throw new BadRequestException(
            `Both users must have a ${currency} wallet`,
          );
        }
        if (Number(senderWallet.balance ?? 0) < amount) {
          throw new PreconditionFailedException('Insufficient wallet balance');
        }

        const reference = idempotencyKey;
        const senderBefore = Number(senderWallet.balance ?? 0);
        const recipientBefore = Number(recipientWallet.balance ?? 0);
        senderWallet.balance = this.roundMoney(senderBefore - amount);
        senderWallet.availableBalance = senderWallet.balance;
        senderWallet.ledgerBalance = senderWallet.balance;
        recipientWallet.balance = this.roundMoney(recipientBefore + amount);
        recipientWallet.availableBalance = recipientWallet.balance;
        recipientWallet.ledgerBalance = recipientWallet.balance;

        await wallets.save([senderWallet, recipientWallet]);

        const operation = await operations.save(
          operations.create({
            userId,
            type: 'internal_transfer',
            idempotencyKey,
            reference,
            status: 'SUCCESS',
            amount,
            currency,
            provider: 'VidalPay',
            providerReference: reference,
            requestPayload: this.redactPayload(payload),
            responsePayload: {
              senderWalletId: senderWallet.id,
              recipientWalletId: recipientWallet.id,
              recipientUserId: recipient.id,
            },
            metadata: {
              recipientTag,
              note: this.asString(payload.note) ?? null,
            },
          }),
        );

        await transactions.save([
          transactions.create({
            userId,
            walletId: senderWallet.id,
            reference: `${reference}_debit`,
            operationReference: reference,
            currency,
            amount,
            balanceBefore: senderBefore,
            balanceAfter: senderWallet.balance,
            type: 'debit',
            status: 'SUCCESS',
            info: 'TAG transfer',
            description: `Transfer to ${recipientTag}`,
            tag: 'internal_transfer',
            provider: 'VidalPay',
            providerReference: reference,
            idempotencyKey,
            metadata: { recipientTag },
          }),
          transactions.create({
            userId: recipient.id,
            walletId: recipientWallet.id,
            reference: `${reference}_credit`,
            operationReference: reference,
            currency,
            amount,
            balanceBefore: recipientBefore,
            balanceAfter: recipientWallet.balance,
            type: 'credit',
            status: 'SUCCESS',
            info: 'TAG transfer',
            description: 'Transfer received',
            tag: 'internal_transfer',
            provider: 'VidalPay',
            providerReference: reference,
            idempotencyKey,
            metadata: { senderUserId: userId },
          }),
        ]);

        return this.normalizeOperation(operation);
      });
    } catch (error) {
      this.throwMissingFeatureStorage(
        error,
        'internal transfers',
        this.isMissingTable(error, 'financial_transaction')
          ? 'financial_transaction'
          : 'provider_operation',
      );
    }
  }

  async getBeneficiaries(userId: string) {
    try {
      const beneficiaries = await this.beneficiaryRepository.find({
        where: { userId },
        order: { createdAt: 'DESC' },
      });
      return { beneficiaries };
    } catch (error) {
      this.throwMissingFeatureStorage(error, 'beneficiaries', 'beneficiary');
    }
  }

  async resolveBeneficiary(tagId: string) {
    const user = await this.findUserByTag(this.userRepository, tagId);
    if (!user) {
      return { recipient: null, beneficiary: null };
    }

    return {
      recipient: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        name: [user.firstName, user.lastName].filter(Boolean).join(' '),
        tagId: user.tagId,
      },
    };
  }

  async getTransactions(userId: string, currency?: Currency | string) {
    const normalizedCurrency = currency
      ? this.normalizeCurrency(currency)
      : undefined;
    const where = normalizedCurrency
      ? { userId, currency: normalizedCurrency }
      : { userId };
    try {
      const transactions = await this.transactionRepository.find({
        where,
        order: { createdAt: 'DESC' },
      });
      return { transactions };
    } catch (error) {
      this.throwMissingFeatureStorage(
        error,
        'transaction_history',
        'financial_transaction',
      );
    }
  }

  async getTransaction(userId: string, id: string) {
    const transaction = await this.transactionRepository.findOne({
      where: [
        { id, userId },
        { reference: id, userId },
        { operationReference: id, userId },
      ],
    });
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }
    return transaction;
  }

  async getTransactionReceipt(userId: string, id: string) {
    const transaction = await this.getTransaction(userId, id);
    return {
      receipt: {
        id: transaction.id,
        reference: transaction.reference,
        transactionId: transaction.id,
        amount: transaction.amount,
        currency: transaction.currency,
        type: transaction.type,
        status: transaction.status,
        description: transaction.description,
        provider: transaction.provider,
        providerReference: transaction.providerReference,
        createdAt: transaction.createdAt,
      },
    };
  }

  async getStatement(userId: string, params: AnyRecord) {
    const from = this.asString(params.from);
    const to = this.asString(params.to);
    const query = this.transactionRepository
      .createQueryBuilder('transaction')
      .where('transaction.userId = :userId', { userId })
      .orderBy('transaction.createdAt', 'DESC');

    if (from) {
      query.andWhere('transaction.createdAt >= :from', { from });
    }
    if (to) {
      query.andWhere('transaction.createdAt <= :to', { to });
    }

    const transactions = await query.getMany();
    return {
      statement: {
        from: from ?? null,
        to: to ?? null,
        format: this.asString(params.format) ?? 'json',
        generatedAt: new Date().toISOString(),
        transactions,
      },
    };
  }

  async listAdminUsers(params: AnyRecord) {
    const page = Math.max(Number(params.page ?? 1) || 1, 1);
    const limit = Math.min(Math.max(Number(params.limit ?? 50) || 50, 1), 100);
    const query = this.userRepository.createQueryBuilder('user');

    const search = this.asString(params.search);
    if (search) {
      const normalizedSearch = `%${search.toLowerCase()}%`;
      query.andWhere(
        `(LOWER(user.email) LIKE :search OR LOWER(user.firstName) LIKE :search OR LOWER(user.lastName) LIKE :search OR LOWER(user.phoneNumber) LIKE :search OR LOWER(user.tagId) LIKE :search OR LOWER(user.id) LIKE :search)`,
        { search: normalizedSearch },
      );
    }

    const status = this.asString(params.status);
    if (status) {
      query.andWhere('user.status = :status', { status });
    }

    const role = this.asString(params.role);
    if (role) {
      query.andWhere('user.role = :role', { role });
    }

    const kycStatus = this.asString(params.kycStatus);
    if (kycStatus) {
      query.andWhere('user.kycStatus = :kycStatus', { kycStatus });
    }

    const [users, total] = await query
      .orderBy('user.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items: users.map((user) => this.normalizeAdminDirectoryUser(user)),
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getAdminUser(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [wallets, kyc, actions] = await Promise.all([
      this.walletRepository.find({
        where: { userId },
        order: { createdAt: 'ASC' },
      }),
      this.kycProfileRepository
        .findOne({ where: { userId } })
        .catch((error) => {
          if (this.isMissingTable(error, 'kyc_profile')) return null;
          throw error;
        }),
      this.providerOperationRepository
        .find({
          where: { userId, type: 'kyc_admin_review' },
          order: { createdAt: 'DESC' },
          take: 50,
        })
        .catch((error) => {
          if (this.isMissingTable(error, 'provider_operation')) return [];
          throw error;
        }),
    ]);

    return {
      user: this.normalizeAdminDirectoryUser(user),
      wallets: wallets.map((wallet) => this.normalizeWallet(wallet)),
      kyc: kyc ? this.normalizeKycProfile(kyc) : null,
      documents: this.adminKycDocuments(kyc),
      actions: actions.map((action) => this.normalizeAdminAction(action)),
    };
  }

  async getAdminFinanceOverview() {
    const [ledgerEntries, providerOperations, recentProviderOperations] =
      await Promise.all([
        this.transactionRepository.count().catch((error) => {
          this.throwMissingFeatureStorage(
            error,
            'transaction_history',
            'financial_transaction',
          );
        }),
        this.providerOperationRepository.count().catch((error) => {
          if (this.isMissingTable(error, 'provider_operation')) return 0;
          throw error;
        }),
        this.providerOperationRepository
          .find({ order: { createdAt: 'DESC' }, take: 8 })
          .catch((error) => {
            if (this.isMissingTable(error, 'provider_operation')) return [];
            throw error;
          }),
      ]);

    return {
      counts: {
        ledgerEntries: ledgerEntries ?? 0,
        providerOperations,
        reconciliationRuns: 0,
      },
      recent: {
        providerOperations: recentProviderOperations.map((operation) => ({
          id: operation.id,
          provider: operation.provider,
          operationType: operation.type,
          status: operation.status,
          createdAt: operation.createdAt,
        })),
      },
    };
  }

  async listAdminMoneyEvents(params: AnyRecord) {
    const page = Math.max(Number(params.page ?? 1) || 1, 1);
    const limit = Math.min(
      Math.max(Number(params.limit ?? params.take ?? 50) || 50, 1),
      100,
    );
    const query = this.transactionRepository.createQueryBuilder('transaction');

    const search = this.asString(params.search);
    if (search) {
      const normalizedSearch = `%${search.toLowerCase()}%`;
      query.andWhere(
        `(LOWER(transaction.id) LIKE :search OR LOWER(transaction.reference) LIKE :search OR LOWER(transaction.userId) LIKE :search OR LOWER(transaction.providerReference) LIKE :search OR LOWER(transaction.operationReference) LIKE :search)`,
        { search: normalizedSearch },
      );
    }

    const currency = this.asString(params.currency)?.toUpperCase();
    if (currency) {
      query.andWhere('transaction.currency = :currency', { currency });
    }

    const status = this.asString(params.status);
    if (status) {
      query.andWhere('transaction.status = :status', { status });
    }

    const [transactions, total] = await query
      .orderBy('transaction.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount()
      .catch((error) => {
        this.throwMissingFeatureStorage(
          error,
          'transaction_history',
          'financial_transaction',
        );
      });

    return {
      items: transactions.map((transaction) =>
        this.normalizeAdminMoneyEvent(transaction),
      ),
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getAdminMoneyEvent(id: string) {
    const transaction = await this.transactionRepository.findOne({
      where: [{ id }, { reference: id }, { operationReference: id }],
    });
    if (!transaction) {
      throw new NotFoundException('Money event not found');
    }
    return {
      moneyEvent: this.normalizeAdminMoneyEvent(transaction),
      ledgerEntry: this.normalizeAdminMoneyEvent(transaction),
    };
  }

  async listAdminProviderOperations(params: AnyRecord) {
    const page = Math.max(Number(params.page ?? 1) || 1, 1);
    const limit = Math.min(
      Math.max(Number(params.limit ?? params.take ?? 50) || 50, 1),
      100,
    );
    const query =
      this.providerOperationRepository.createQueryBuilder('operation');

    const search = this.asString(params.search);
    if (search) {
      const normalizedSearch = `%${search.toLowerCase()}%`;
      query.andWhere(
        `(LOWER(operation.id) LIKE :search OR LOWER(operation.reference) LIKE :search OR LOWER(operation.userId) LIKE :search OR LOWER(operation.providerReference) LIKE :search)`,
        { search: normalizedSearch },
      );
    }

    const status = this.asString(params.status);
    if (status) {
      query.andWhere('operation.status = :status', { status });
    }

    const type = this.asString(params.type ?? params.operationType);
    if (type) {
      query.andWhere('operation.type = :type', { type });
    }

    const provider = this.asString(params.provider);
    if (provider) {
      query.andWhere('LOWER(operation.provider) = :provider', {
        provider: provider.toLowerCase(),
      });
    }

    const userId = this.asString(params.userId);
    if (userId) {
      query.andWhere('operation.userId = :userId', { userId });
    }

    const [operations, total] = await query
      .orderBy('operation.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount()
      .catch((error): [ProviderOperation[], number] => {
        if (this.isMissingTable(error, 'provider_operation')) return [[], 0];
        throw error;
      });

    return {
      items: operations.map((operation) =>
        this.normalizeAdminProviderOperation(operation),
      ),
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async listAdminSupportTickets(params: AnyRecord) {
    const page = Math.max(Number(params.page ?? 1) || 1, 1);
    const limit = Math.min(
      Math.max(Number(params.limit ?? params.take ?? 50) || 50, 1),
      100,
    );
    const query = this.supportTicketRepository.createQueryBuilder('ticket');

    const search = this.asString(params.search);
    if (search) {
      const normalizedSearch = `%${search.toLowerCase()}%`;
      query.andWhere(
        `(LOWER(ticket.id) LIKE :search OR LOWER(ticket.userId) LIKE :search OR LOWER(ticket.subject) LIKE :search OR LOWER(ticket.category) LIKE :search)`,
        { search: normalizedSearch },
      );
    }

    const status = this.asString(params.status);
    if (status) {
      query.andWhere('ticket.status = :status', { status });
    }

    const category = this.asString(params.category);
    if (category) {
      query.andWhere('LOWER(ticket.category) = :category', {
        category: category.toLowerCase(),
      });
    }

    const userId = this.asString(params.userId);
    if (userId) {
      query.andWhere('ticket.userId = :userId', { userId });
    }

    const [tickets, total] = await query
      .orderBy('ticket.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount()
      .catch((error): [SupportTicket[], number] => {
        if (this.isMissingTable(error, 'support_ticket')) return [[], 0];
        throw error;
      });

    return {
      items: tickets.map((ticket) => this.normalizeAdminSupportTicket(ticket)),
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getAdminSupportTicket(id: string) {
    const ticket = await this.supportTicketRepository.findOne({
      where: { id },
    });
    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }
    return {
      ticket: this.normalizeAdminSupportTicket(ticket),
    };
  }

  async listAdminWhatsAppConversations(params: AnyRecord) {
    return this.listAdminProviderOperations({
      ...params,
      type: 'whatsapp_webhook',
    });
  }

  async listAdminVtuOperations(params: AnyRecord) {
    const page = Math.max(Number(params.page ?? 1) || 1, 1);
    const limit = Math.min(
      Math.max(Number(params.limit ?? params.take ?? 50) || 50, 1),
      100,
    );
    const query =
      this.providerOperationRepository.createQueryBuilder('operation');

    query.andWhere(
      `(operation.type IN (:...types) OR LOWER(operation.provider) LIKE :provider)`,
      {
        types: ['airtime', 'data', 'utilities', 'vtu_webhook'],
        provider: '%vtu%',
      },
    );

    const search = this.asString(params.search);
    if (search) {
      const normalizedSearch = `%${search.toLowerCase()}%`;
      query.andWhere(
        `(LOWER(operation.id) LIKE :search OR LOWER(operation.reference) LIKE :search OR LOWER(operation.userId) LIKE :search OR LOWER(operation.providerReference) LIKE :search)`,
        { search: normalizedSearch },
      );
    }

    const status = this.asString(params.status);
    if (status) {
      query.andWhere('operation.status = :status', { status });
    }

    const userId = this.asString(params.userId);
    if (userId) {
      query.andWhere('operation.userId = :userId', { userId });
    }

    const [operations, total] = await query
      .orderBy('operation.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount()
      .catch((error): [ProviderOperation[], number] => {
        if (this.isMissingTable(error, 'provider_operation')) return [[], 0];
        throw error;
      });

    return {
      items: operations.map((operation) =>
        this.normalizeAdminProviderOperation(operation),
      ),
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getAdminProviderOperation(id: string) {
    const operation = await this.providerOperationRepository.findOne({
      where: [{ id }, { reference: id }, { providerReference: id }],
    });
    if (!operation) {
      throw new NotFoundException('Provider operation not found');
    }
    const linkedTransactions = await this.transactionRepository
      .find({
        where: [
          { operationReference: operation.reference },
          { providerReference: operation.providerReference ?? '' },
        ],
        order: { createdAt: 'DESC' },
      })
      .catch((error) => {
        if (this.isMissingTable(error, 'financial_transaction')) return [];
        throw error;
      });

    return {
      operation: this.normalizeAdminProviderOperation(operation),
      providerOperation: this.normalizeAdminProviderOperation(operation),
      moneyEvent: linkedTransactions[0]
        ? this.normalizeAdminMoneyEvent(linkedTransactions[0])
        : null,
      ledgerEntries: linkedTransactions.map((transaction) =>
        this.normalizeAdminMoneyEvent(transaction),
      ),
    };
  }

  async getKycStatus(userId: string) {
    const user = await this.findUser(userId);
    const profile = await this.getKycProfileForSession(user);
    return {
      ...this.normalizeKycProfile(profile),
      storageStatus: profile.id ? 'AVAILABLE' : 'LEGACY_FALLBACK',
      persistent: Boolean(profile.id),
    };
  }

  async listKycReviews() {
    const profiles = await this.kycProfileRepository.find({
      order: { updatedAt: 'DESC' },
    });
    const users = profiles.length
      ? await this.userRepository.findBy({
          id: In(profiles.map((profile) => profile.userId)),
        })
      : [];
    const usersById = new Map(users.map((user) => [user.id, user]));

    return {
      items: profiles.map((profile) => ({
        user: this.normalizeAdminUser(usersById.get(profile.userId)),
        kyc: this.normalizeKycProfile(profile),
      })),
    };
  }

  async getKycReview(userId: string) {
    const user = await this.findUser(userId);
    const profile = await this.getOrCreateKycProfile(user);
    return {
      user: this.normalizeAdminUser(user),
      kyc: this.normalizeKycProfile(profile),
    };
  }

  async reviewKyc(
    adminUserId: string,
    userId: string,
    decision: 'VERIFIED' | 'REJECTED' | 'IN_PROGRESS' | 'RETRY_REQUIRED',
    reason?: string,
    options: {
      missingRequirements?: string[];
      message?: string;
      actionRequired?: boolean;
    } = {},
  ) {
    await this.findUser(adminUserId);
    const user = await this.findUser(userId);
    const profile = await this.getKycProfileForSession(user);
    const normalizedReason = this.asString(reason);
    const statusMessage =
      this.asString(options.message) ??
      normalizedReason ??
      (decision === 'RETRY_REQUIRED'
        ? 'Additional KYC information is required.'
        : null);
    const missingRequirements = this.normalizeStringList(
      options.missingRequirements,
    );

    profile.status = decision;
    profile.statusMessage = statusMessage;
    profile.rejectionReason =
      decision === 'REJECTED' || decision === 'RETRY_REQUIRED'
        ? (normalizedReason ?? statusMessage)
        : null;
    profile.capabilities = this.capabilitiesForKycStatus(decision);
    profile.limits = this.defaultLimits(decision);
    profile.identity = this.mergeKycIdentityAction(profile.identity, {
      actionRequired: options.actionRequired ?? decision === 'RETRY_REQUIRED',
      missingRequirements,
      message: statusMessage,
      reviewedBy: adminUserId,
      reviewedAt: new Date().toISOString(),
      status: decision,
    });
    profile.sections = this.markMissingKycSections(
      profile.sections,
      profile.region,
      missingRequirements,
      decision,
    );
    if (profile.id) {
      await this.kycProfileRepository.save(profile);
    }
    user.kycStatus = decision;
    await this.userRepository.update(userId, { kycStatus: decision });

    const auditReference = `kyc_review_${randomUUID()}`;
    try {
      await this.providerOperationRepository.save(
        this.providerOperationRepository.create({
          userId,
          type: 'kyc_admin_review',
          idempotencyKey: auditReference,
          reference: auditReference,
          status: 'APPLIED',
          provider: 'VidalPay',
          requestPayload: {
            decision,
            reason: normalizedReason,
            message: statusMessage,
            missingRequirements,
            reviewedBy: adminUserId,
          },
          metadata: {
            audit: true,
            adminUserId,
            decision,
            missingRequirements,
          },
        }),
      );
    } catch (error) {
      if (!this.isMissingTable(error, 'provider_operation')) throw error;
    }

    let notification: AnyRecord = { status: 'STORAGE_UNAVAILABLE' };
    try {
      notification = (
        await this.sendNotificationToUser(userId, {
          title:
            decision === 'VERIFIED'
              ? 'Account verification approved'
              : decision === 'REJECTED' || decision === 'RETRY_REQUIRED'
                ? 'More KYC information is required'
                : 'KYC review update',
          body:
            statusMessage ??
            (decision === 'VERIFIED'
              ? 'Your account verification was approved.'
              : 'Please review your KYC checklist and submit the remaining information.'),
          category: 'KYC',
          metadata: {
            status: decision,
            reviewedBy: adminUserId,
            missingRequirements,
            screen: 'KYC',
            actionRequired: decision === 'RETRY_REQUIRED',
          },
        })
      ).push;
    } catch (error) {
      if (!this.isMissingTable(error, 'notification')) throw error;
    }

    return {
      user: this.normalizeAdminUser(user),
      kyc: this.normalizeKycProfile(profile),
      notification,
    };
  }

  async requestKycInformation(
    adminUserId: string,
    userId: string,
    payload: AnyRecord,
  ) {
    const reason =
      this.asString(payload.reason) ??
      this.asString(payload.message) ??
      'Additional KYC information is required.';
    const missingRequirements = this.normalizeStringList(
      Array.isArray(payload.missingRequirements)
        ? payload.missingRequirements
        : Array.isArray(payload.requirements)
          ? payload.requirements
          : undefined,
    );
    const result = await this.reviewKyc(
      adminUserId,
      userId,
      'RETRY_REQUIRED',
      reason,
      {
        missingRequirements,
        message: this.asString(payload.message) ?? reason,
        actionRequired: true,
      },
    );

    return {
      ...result,
      status: 'ACTION_REQUIRED',
      kycStatus: 'RETRY_REQUIRED',
      accountLevel: result.kyc?.limits?.accountProgressLevel ?? 2,
      message: 'Additional KYC information has been requested.',
      missingRequirements,
    };
  }

  async startKyc(userId: string) {
    const user = await this.findUser(userId);
    const profile = await this.getKycProfileForSession(user);
    const region = profile.region ?? this.inferRegion(user);

    if (!region) {
      throw new BadRequestException(
        createBlockedResponse({
          code: 'KYC_REGION_REQUIRED',
          feature: 'KYC',
          capability: 'kyc_start',
          provider: null,
          reason:
            'A supported country or phone region is required before KYC can start.',
          missingRequirements: ['country', 'countryCode', 'region'],
        }),
      );
    }
    if (!['NG', 'US'].includes(region)) {
      throw new BadRequestException(
        createBlockedResponse({
          code: 'KYC_UNSUPPORTED_REGION',
          feature: 'KYC',
          capability: 'kyc_start',
          provider: null,
          reason:
            'KYC is currently configured for Nigeria and United States users.',
          missingRequirements: ['supportedRegion'],
        }),
      );
    }

    if (this.fincraKycEnabled(region)) {
      profile.region = region;
      profile.provider = 'FINCRA';
      profile.status =
        profile.status === 'NOT_STARTED' ? 'IN_PROGRESS' : profile.status;
      const kycStorageAvailable = await this.persistKycStartState(
        userId,
        profile,
      );
      return {
        provider: 'FINCRA',
        mode: 'BACKEND_VERIFICATION',
        status: profile.status,
        requirements: this.fincraKycRequirements(region),
        submission: {
          identity: '/api/v1/user/kyc/identity',
          address: '/api/v1/user/kyc/address',
          liveness: '/api/v1/user/kyc/liveness',
        },
        fallbackProvider: this.metamapConfigured() ? 'METAMAP' : null,
        metadata: {
          userId,
          profileId: kycStorageAvailable ? (profile.id ?? null) : null,
          region,
          provider: 'FINCRA',
          storageAvailable: kycStorageAvailable,
        },
      };
    }

    const clientId =
      this.configService.get<string>('METAMAP_CLIENT_ID') ??
      this.configService.get<string>('METAMAP_MERCHANT_TOKEN');
    const workflowId =
      this.configService.get<string>('METAMAP_WORKFLOW_ID') ??
      this.configService.get<string>('METAMAP_FLOW_ID');

    if (!clientId || !workflowId) {
      this.throwProviderUnavailable({
        code: 'KYC_PROVIDER_UNAVAILABLE',
        feature: 'KYC',
        capability: 'kyc_start',
        provider: 'Fincra/MetaMap',
        reason: 'Neither Fincra KYC nor MetaMap KYC is configured.',
        missingRequirements: [
          'FINCRA_KYC_ENABLED',
          'FINCRA_API_KEY',
          'FINCRA_BUSINESS_ID',
          'METAMAP_CLIENT_ID',
          'METAMAP_WORKFLOW_ID',
        ].filter((key) => !this.configService.get<string>(key)),
      });
    }

    profile.region = region;
    profile.provider = 'METAMAP';
    profile.status =
      profile.status === 'NOT_STARTED' ? 'IN_PROGRESS' : profile.status;
    const kycStorageAvailable = await this.persistKycStartState(
      userId,
      profile,
    );

    return {
      provider: 'METAMAP',
      clientId,
      workflowId,
      metadata: {
        userId,
        profileId: kycStorageAvailable ? (profile.id ?? null) : null,
        region,
        provider: 'METAMAP',
        storageAvailable: kycStorageAvailable,
      },
    };
  }

  async uploadKycDocument(userId: string, payload: AnyRecord) {
    await this.findUser(userId);
    throw new ServiceUnavailableException(
      createBlockedResponse({
        code: 'KYC_DOCUMENT_STORAGE_UNAVAILABLE',
        feature: 'kyc_document_upload',
        capability: 'kyc_document_storage',
        provider: 'VidalPay',
        reason:
          'KYC documents are not stored as local device URIs. Configure encrypted backend object storage or submit documents through the configured KYC provider.',
        missingRequirements: ['KYC_DOCUMENT_STORAGE_PROVIDER'],
        retryable: false,
      }),
    );
  }

  async submitKycSection(
    userId: string,
    section: 'GOVERNMENT_ID' | 'ADDRESS' | 'LIVENESS',
    payload: AnyRecord,
  ) {
    const user = await this.findUser(userId);
    const profile = await this.getOrCreateKycProfile(user);
    profile.identity = {
      ...(profile.identity ?? {}),
      ...this.redactPayload(payload),
    };
    if (
      section === 'GOVERNMENT_ID' &&
      profile.provider === 'FINCRA' &&
      this.fincraKycEnabled(profile.region ?? this.inferRegion(user))
    ) {
      profile.identity = {
        ...profile.identity,
        fincra: await this.verifyFincraIdentity(userId, user, payload),
      };
    }
    profile.sections = this.updateKycSection(
      profile.sections,
      section,
      'SUBMITTED',
    );
    profile.status = this.computeKycStatus(profile.sections);
    await this.kycProfileRepository.save(profile);
    await this.userRepository.update(userId, { kycStatus: profile.status });

    return this.normalizeKycProfile(profile);
  }

  async submitKycProfile(userId: string, payload: AnyRecord) {
    const user = await this.findUser(userId);
    const profile = await this.getOrCreateKycProfile(user);
    profile.identity = {
      ...(profile.identity ?? {}),
      ...(this.asRecord(payload.identity) ?? {}),
    };
    profile.uploads = Array.isArray(payload.documents)
      ? (payload.documents as AnyRecord[])
      : profile.uploads;
    profile.status = 'UNDER_REVIEW';
    await this.kycProfileRepository.save(profile);
    await this.userRepository.update(userId, { kycStatus: profile.status });
    return this.normalizeKycProfile(profile);
  }

  async handleKycWebhook(payload: AnyRecord, signature?: string) {
    this.assertKycWebhookSignature(payload, signature);

    const eventId =
      this.asString(payload.eventId) ??
      this.asString(payload.event_id) ??
      this.asString(payload.verificationId) ??
      this.asString(payload.reference) ??
      this.asString(payload.id);
    const idempotencyKey =
      eventId ??
      `payload:${createHash('sha256')
        .update(JSON.stringify(payload))
        .digest('hex')}`;

    let existingOperation: ProviderOperation | null = null;
    try {
      existingOperation = await this.providerOperationRepository.findOne({
        where: { type: 'kyc_webhook', idempotencyKey },
      });
    } catch (error) {
      if (!this.isMissingTable(error, 'provider_operation')) throw error;
    }
    if (existingOperation) {
      return {
        received: true,
        updated: false,
        duplicate: true,
        status: existingOperation.metadata?.status ?? existingOperation.status,
      };
    }

    const metadata = this.asRecord(payload.metadata) ?? {};
    const userId =
      this.asString(metadata.userId) ?? this.asString(payload.userId);
    const status = this.mapProviderKycStatus(
      this.asString(payload.status) ??
        this.asString(payload.verificationStatus) ??
        this.asString(payload.eventName),
    );

    if (!userId) {
      return {
        received: true,
        updated: false,
        reason: 'No userId in webhook metadata',
      };
    }

    const user = await this.findUser(userId);
    const profile = await this.getKycProfileForSession(user);
    profile.status = status;
    profile.statusMessage = this.asString(payload.message) ?? null;
    profile.rejectionReason = this.asString(payload.rejectionReason) ?? null;
    profile.capabilities = this.capabilitiesForKycStatus(status);
    profile.limits = this.defaultLimits(status);
    profile.providerReference =
      this.asString(payload.verificationId) ??
      this.asString(payload.id) ??
      null;
    if (profile.id) {
      await this.kycProfileRepository.save(profile);
    }
    await this.userRepository.update(userId, {
      kycStatus: status,
    });

    const reference = `kyc_webhook_${createHash('sha256')
      .update(idempotencyKey)
      .digest('hex')}`;
    try {
      await this.providerOperationRepository.save(
        this.providerOperationRepository.create({
          userId,
          type: 'kyc_webhook',
          idempotencyKey,
          reference,
          status: 'APPLIED',
          provider: 'MetaMap',
          providerReference: profile.providerReference,
          requestPayload: this.redactPayload(payload),
          responsePayload: { status, userId },
          metadata: { status, eventId: eventId ?? null },
        }),
      );
    } catch (error) {
      if (!this.isMissingTable(error, 'provider_operation')) throw error;
    }

    let notification: AnyRecord = { status: 'STORAGE_UNAVAILABLE' };
    try {
      notification = (
        await this.sendNotificationToUser(userId, {
          title: 'KYC status updated',
          body:
            status === 'VERIFIED'
              ? 'Your identity verification was approved.'
              : status === 'REJECTED' || status === 'FAILED'
                ? 'Your identity verification needs attention. Review the details and submit the missing information.'
                : 'Your identity verification is being reviewed.',
          category: 'KYC',
          metadata: { kycStatus: status },
        })
      ).push;
    } catch (error) {
      if (!this.isMissingTable(error, 'notification')) throw error;
    }

    return {
      received: true,
      updated: true,
      status,
      notification,
    };
  }

  async listCards(userId: string) {
    try {
      const cards = await this.cardRepository.find({
        where: { userId },
        order: { createdAt: 'DESC' },
      });
      return {
        cards: cards.map((card) => this.normalizeCard(card)),
        storageStatus: 'AVAILABLE',
      };
    } catch (error) {
      if (!this.isMissingTable(error, 'card')) {
        throw error;
      }
      return {
        cards: [],
        storageStatus: 'LEGACY_STORAGE_UNAVAILABLE',
        message:
          'No card storage exists in this legacy database. No card has been issued or fabricated.',
      };
    }
  }

  async createCard(
    userId: string,
    type: 'virtual' | 'physical',
    payload: AnyRecord,
  ) {
    const currency = this.normalizeCurrency(payload.currency ?? Currency.USD);
    const capability: ProviderCapability =
      currency === Currency.USD
        ? type === 'virtual'
          ? 'usd_virtual_card'
          : 'usd_physical_card'
        : type === 'virtual'
          ? 'ngn_virtual_card'
          : 'ngn_physical_card';

    if (
      currency === Currency.NGN &&
      this.providerStatusService.isCapabilityEnabled(capability)
    ) {
      const pin = this.asString(payload.transactionPin ?? payload.pin);
      if (!pin) throw new BadRequestException('transactionPin is required');
      await this.assertTransactionPin(userId, pin);
      const idempotencyKey =
        this.asString(payload.idempotencyKey) ??
        this.asString(payload.reference);
      if (!idempotencyKey)
        throw new BadRequestException('idempotencyKey is required');
      const cardholderId = this.asString(payload.cardholderId);
      const fundingSourceId = this.asString(payload.fundingSourceId);
      if (!cardholderId || !fundingSourceId) {
        throw new BadRequestException(
          'cardholderId and fundingSourceId are required',
        );
      }
      const existing = await this.providerOperationRepository.findOne({
        where: { userId, type: `${type}_card_create`, idempotencyKey },
      });
      if (existing) return this.normalizeOperation(existing);
      const operation = await this.providerOperationRepository.save(
        this.providerOperationRepository.create({
          userId,
          type: `${type}_card_create`,
          idempotencyKey,
          reference: idempotencyKey,
          status: 'PENDING',
          amount: null,
          currency,
          provider: 'Sudo',
          requestPayload: this.redactPayload(payload),
          responsePayload: null,
          errorCode: null,
          failureReason: null,
          metadata: { sandbox: true },
        }),
      );
      try {
        const response = await this.sandboxProviderService.createSudoCard({
          type,
          cardholderId,
          fundingSourceId,
          cardProgramId: this.asString(payload.cardProgramId) ?? undefined,
          metadata: { userId, idempotencyKey },
        });
        const providerCard = (response.data ?? response) as AnyRecord;
        const providerCardId =
          this.asString(providerCard._id) ?? this.asString(providerCard.id);
        if (!providerCardId)
          throw new Error('Sudo response did not include a card ID');
        const card = await this.cardRepository.save(
          this.cardRepository.create({
            userId,
            type,
            currency,
            status: this.asString(providerCard.status) ?? 'PENDING',
            maskedPan: this.asString(providerCard.maskedPan) ?? null,
            last4: this.asString(providerCard.last4) ?? null,
            expiryMonth: this.asString(providerCard.expiryMonth) ?? null,
            expiryYear: this.asString(providerCard.expiryYear) ?? null,
            cardholderName: this.asString(providerCard.cardholderName) ?? null,
            balance: 0,
            availableBalance: 0,
            limits: null,
            billingAddress: (payload.billingAddress as AnyRecord) ?? null,
            provider: 'Sudo',
            providerCardId,
            providerStatus: this.asString(providerCard.status) ?? 'PENDING',
          }),
        );
        operation.status = 'SUBMITTED';
        operation.providerReference = providerCardId;
        operation.responsePayload = this.redactPayload(response);
        operation.metadata = { ...operation.metadata, cardId: card.id };
        await this.providerOperationRepository.save(operation);
        return this.normalizeCard(card);
      } catch (error) {
        operation.status = 'FAILED';
        operation.errorCode = 'PROVIDER_REQUEST_FAILED';
        operation.failureReason = this.providerErrorMessage(error);
        await this.providerOperationRepository.save(operation);
        throw new ServiceUnavailableException(
          createBlockedResponse({
            code: operation.errorCode,
            feature: `${type}_card_create`,
            capability,
            provider: 'Sudo',
            reason: operation.failureReason,
            retryable: true,
          }),
        );
      }
    }
    await this.recordBlockedOperation(userId, `${type}_card_create`, payload, {
      provider: currency === Currency.USD ? 'Unit.co' : 'Sudo',
      capability,
      reason:
        'Card creation requires a provider customer/account mapping and live-tested card issuing credentials.',
    });
  }

  async getCard(userId: string, cardId: string) {
    const card = await this.cardRepository.findOne({
      where: { id: cardId, userId },
    });
    if (!card) {
      throw new NotFoundException('Card not found');
    }
    return this.normalizeCard(card);
  }

  async getCardTransactions(userId: string, cardId: string) {
    await this.getCard(userId, cardId);
    const transactions = await this.transactionRepository.find({
      where: { userId, metadata: { cardId } as never },
      order: { createdAt: 'DESC' },
    });
    return { transactions };
  }

  async blockCardOperation(
    userId: string,
    cardId: string,
    operation: string,
    payload: AnyRecord = {},
  ) {
    await this.getCard(userId, cardId);
    const capabilityByOperation: Record<string, ProviderCapability> = {
      freeze: 'card_freeze',
      unfreeze: 'card_unfreeze',
      terminate: 'card_terminate',
      settings: 'card_limits',
      limits: 'card_limits',
      fund: 'card_topup',
      withdraw: 'card_topup',
      reveal: 'card_limits',
    };
    await this.recordBlockedOperation(userId, `card_${operation}`, payload, {
      provider: 'Unit.co',
      capability: capabilityByOperation[operation] ?? 'card_limits',
      reason:
        operation === 'reveal'
          ? 'Secure PAN/CVV reveal is blocked until a provider-supported, audited reveal flow is implemented.'
          : 'Card lifecycle changes require a configured provider card id and live-tested provider adapter.',
    });
  }

  async getCardLimits(userId: string, cardId: string) {
    const card = await this.getCard(userId, cardId);
    return {
      cardId,
      limits: card.limits ?? {},
      providerStatus: card.providerStatus ?? 'NOT_PROVISIONED',
    };
  }

  async listNotifications(userId: string) {
    try {
      const notifications = await this.notificationRepository.find({
        where: { userId },
        order: { createdAt: 'DESC' },
      });
      return { notifications };
    } catch (error) {
      this.throwMissingFeatureStorage(error, 'notifications', 'notification');
    }
  }

  async sendNotificationToUser(
    userId: string,
    payload: {
      title: string;
      body: string;
      category?: string;
      metadata?: AnyRecord;
    },
  ) {
    await this.findUser(userId);
    const notification = await this.notificationRepository.save(
      this.notificationRepository.create({
        userId,
        title: payload.title,
        body: payload.body,
        category: payload.category ?? 'General',
        read: false,
        metadata: this.redactPayload(payload.metadata ?? {}),
      }),
    );

    const preference = await this.getOrCreateNotificationPreference(userId);
    const preferences =
      preference.preferences ?? this.defaultNotificationPreferences();
    const devices = await this.notificationDeviceRepository.find({
      where: { userId, revokedAt: IsNull() },
    });
    const pushDevices =
      preferences.push === false
        ? []
        : devices.filter((device) =>
            this.asString(device.pushToken ?? device.token),
          );

    if (pushDevices.length === 0) {
      return {
        notification,
        push: {
          status:
            preferences.push === false
              ? 'DISABLED_BY_USER'
              : 'NO_ACTIVE_DEVICES',
          attempted: 0,
          delivered: 0,
        },
      };
    }

    const messages = pushDevices.map((device) => ({
      to: this.asString(device.pushToken ?? device.token),
      title: payload.title,
      body: payload.body,
      data: { notificationId: notification.id, ...(payload.metadata ?? {}) },
      sound: 'default',
    }));

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      const accessToken = this.configService.get<string>(
        'EXPO_PUSH_ACCESS_TOKEN',
      );
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }
      const response = await axios.post(
        'https://exp.host/--/api/v2/push/send',
        messages,
        { headers, timeout: 10000 },
      );
      const receipts = Array.isArray(response.data?.data)
        ? response.data.data
        : [];
      const errors = receipts.filter(
        (receipt: AnyRecord) => receipt.status === 'error',
      );

      for (let index = 0; index < receipts.length; index += 1) {
        const receipt = receipts[index] as AnyRecord;
        if (receipt.status !== 'error') {
          continue;
        }
        if (
          receipt.details &&
          typeof receipt.details === 'object' &&
          (receipt.details as AnyRecord).error === 'DeviceNotRegistered'
        ) {
          const device = pushDevices[index];
          await this.notificationDeviceRepository.update(
            { id: device.id, userId },
            { revokedAt: new Date() },
          );
        }
      }

      return {
        notification,
        push: {
          status: errors.length ? 'PARTIAL_FAILURE' : 'SENT',
          attempted: messages.length,
          delivered: Math.max(messages.length - errors.length, 0),
          failed: errors.length,
        },
      };
    } catch (error) {
      return {
        notification,
        push: {
          status: 'DELIVERY_FAILED',
          attempted: messages.length,
          delivered: 0,
          failed: messages.length,
          failureReason:
            error instanceof Error ? error.message : 'Expo push request failed',
        },
      };
    }
  }

  async markNotificationsRead(userId: string, notificationIds?: string[]) {
    const where = notificationIds?.length
      ? { userId, id: In(notificationIds) }
      : { userId };
    await this.notificationRepository.update(where, { read: true });
    return { updated: true };
  }

  async getNotificationPreferences(userId: string) {
    try {
      const preference = await this.getOrCreateNotificationPreference(userId);
      return {
        ...(preference.preferences ?? this.defaultNotificationPreferences()),
        storageStatus: 'AVAILABLE',
        persistent: true,
      };
    } catch (error) {
      if (!this.isMissingTable(error, 'notification_preference')) {
        throw error;
      }
      return {
        ...this.defaultNotificationPreferences(),
        storageStatus: 'LEGACY_FALLBACK',
        persistent: false,
        message:
          'Default notification settings are shown until persistent preference storage is available.',
      };
    }
  }

  async updateNotificationPreferences(userId: string, payload: AnyRecord) {
    const preference = await this.getOrCreateNotificationPreference(userId);
    preference.preferences = {
      ...(preference.preferences ?? this.defaultNotificationPreferences()),
      ...payload,
    };
    await this.notificationPreferenceRepository.save(preference);
    return preference.preferences;
  }

  async listNotificationDevices(userId: string) {
    try {
      const devices = await this.notificationDeviceRepository.find({
        where: { userId, revokedAt: IsNull() },
        order: { createdAt: 'DESC' },
      });
      return { devices, storageStatus: 'AVAILABLE', persistent: true };
    } catch (error) {
      if (!this.isMissingTable(error, 'notification_device')) {
        throw error;
      }
      return {
        devices: [],
        storageStatus: 'LEGACY_STORAGE_UNAVAILABLE',
        persistent: false,
        message:
          'Push notification devices cannot be registered persistently until device storage is available.',
      };
    }
  }

  async registerNotificationDevice(userId: string, payload: AnyRecord) {
    const deviceId = this.asString(payload.deviceId);
    const existing = deviceId
      ? await this.notificationDeviceRepository.findOne({
          where: { userId, deviceId },
        })
      : null;
    const entity =
      existing ?? this.notificationDeviceRepository.create({ userId });
    Object.assign(entity, {
      deviceId,
      subscriptionId: this.asString(payload.subscriptionId),
      token: this.asString(payload.token),
      pushToken: this.asString(payload.pushToken),
      provider: this.asString(payload.provider) ?? 'EXPO',
      platform: this.asString(payload.platform),
      deviceName: this.asString(payload.deviceName),
      appVersion: this.asString(payload.appVersion),
      revokedAt: null,
      metadata: this.redactPayload(payload),
    });
    return this.notificationDeviceRepository.save(entity);
  }

  async revokeNotificationDevice(userId: string, id: string) {
    const result = await this.notificationDeviceRepository.update(
      { userId, id },
      { revokedAt: new Date() },
    );
    if (!result.affected) {
      throw new NotFoundException('Notification device not found');
    }
    return { revoked: true };
  }

  async supportOverview() {
    return {
      contact: {
        email:
          this.configService.get<string>('SUPPORT_EMAIL') ??
          'support@vidalpay.com',
        phone: this.configService.get<string>('SUPPORT_PHONE') ?? null,
      },
      responseWindows: {
        urgent: 'Same business day',
        standard: 'Within 1 business day',
      },
      categories: ['Account', 'Wallet', 'Transfer', 'Cards', 'KYC', 'Other'],
      faqCount: this.faqs().length,
      ticketingEnabled: true,
    };
  }

  async supportFaqs() {
    return { faqs: this.faqs() };
  }

  async listSupportTickets(userId: string) {
    const tickets = await this.supportTicketRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return { tickets };
  }

  async createSupportTicket(userId: string, payload: AnyRecord) {
    const zendeskStatus =
      this.providerStatusService.getStatus('zendesk_support');
    const metadata = this.redactPayload({
      ...(this.asRecord(payload.metadata) ?? {}),
      zendesk: {
        syncStatus: zendeskStatus.enabled ? 'PENDING' : 'NOT_CONFIGURED',
        readinessStatus: zendeskStatus.readinessStatus,
        missingEnvVars: zendeskStatus.missingEnvVars,
      },
    });
    const ticket = await this.supportTicketRepository.save(
      this.supportTicketRepository.create({
        userId,
        category: this.asString(payload.category) ?? 'General',
        subject: this.asString(payload.subject) ?? 'Support request',
        message: this.asString(payload.message) ?? '',
        priority: this.asString(payload.priority) ?? 'NORMAL',
        preferredChannel: this.asString(payload.preferredChannel) ?? null,
        metadata,
      }),
    );
    if (!zendeskStatus.enabled) {
      return {
        ticket,
        providerSync: {
          provider: 'Zendesk',
          status: 'NOT_CONFIGURED',
          missingRequirements: zendeskStatus.missingEnvVars,
          message:
            'The local support ticket was saved. Zendesk sync is unavailable until backend Zendesk credentials are configured.',
        },
      };
    }

    return {
      ticket,
      providerSync: {
        provider: 'Zendesk',
        status: 'BLOCKED',
        missingRequirements: ['ZENDESK_TICKET_ADAPTER_LIVE_TEST'],
        message:
          'The local support ticket was saved. Zendesk ticket creation remains blocked until the Zendesk adapter is implemented and live-tested with the configured account.',
      },
    };
  }

  async createDispute(userId: string, payload: AnyRecord) {
    const idempotencyKey =
      this.asString(payload.idempotencyKey) ?? `dispute_${randomUUID()}`;
    const existing = await this.disputeRepository.findOne({
      where: { userId, idempotencyKey },
    });
    if (existing) {
      return { dispute: existing };
    }
    const dispute = await this.disputeRepository.save(
      this.disputeRepository.create({
        userId,
        idempotencyKey,
        transactionId: this.asString(payload.transactionId) ?? '',
        reason: this.asString(payload.reason) ?? 'OTHER',
        description: this.asString(payload.description) ?? '',
        disputedAmount:
          payload.disputedAmount === undefined
            ? null
            : this.normalizeAmount(payload.disputedAmount),
        attestation: payload.attestation === true,
        status: 'OPEN',
        provider: null,
        providerReference: null,
        metadata: this.redactPayload(payload),
      }),
    );
    return { dispute };
  }

  async legalOverview() {
    return {
      supportEmail:
        this.configService.get<string>('SUPPORT_EMAIL') ??
        'support@vidalpay.com',
      documents: this.legalDocuments().map(
        ({ content, ...summary }) => summary,
      ),
    };
  }

  async legalDocument(slug: string) {
    const document = this.legalDocuments().find((item) => item.slug === slug);
    if (!document) {
      throw new NotFoundException('Legal document not found');
    }
    return document;
  }

  async cryptoOverview(userId: string) {
    await this.assertProductAccess(userId, 'crypto');
    return {
      enabled: false,
      comingSoon: true,
      message:
        'Crypto is not enabled because no crypto provider is configured in the backend.',
      region: null,
      provider: null,
      productAvailability: {
        crypto: false,
        staking: false,
        microLoans: false,
      },
      portfolio: {
        totalValue: null,
        currency: null,
        positions: [],
      },
      features: [
        { code: 'crypto_deposit', title: 'Crypto deposits', enabled: false },
        {
          code: 'crypto_withdrawal',
          title: 'Crypto withdrawals',
          enabled: false,
        },
      ],
    };
  }

  async cryptoAssets(userId: string) {
    await this.assertProductAccess(userId, 'crypto');
    return { assets: [] };
  }

  async investmentsOverview(userId: string) {
    await this.assertProductAccess(userId, 'investments');
    return {
      enabled: false,
      provider: null,
      message:
        'Investment products are unavailable until a backend investment provider is configured.',
      portfolioValue: null,
      currency: null,
    };
  }

  async investmentsPortfolio(userId: string) {
    await this.assertProductAccess(userId, 'investments');
    return {
      enabled: false,
      provider: null,
      positions: [],
      totalValue: null,
      currency: null,
      message:
        'Investment portfolio values are unavailable until a backend investment provider is configured.',
    };
  }

  async investmentProducts(userId: string) {
    await this.assertProductAccess(userId, 'investments');
    return { products: [], items: [] };
  }

  async blockInvestmentOperation(
    userId: string,
    payload: AnyRecord,
    type: string,
  ) {
    await this.assertProductAccess(userId, 'investments');
    await this.recordBlockedOperation(userId, type, payload, {
      provider: 'Investment provider',
      capability:
        type === 'investment_account'
          ? 'investments_account'
          : 'investments_orders',
      reason:
        'Investment operations require a regulated investment provider integration.',
    });
  }

  async taxStatus(userId: string) {
    await this.assertProductAccess(userId, 'foreign_tax');
    return {
      enabled: false,
      status: 'UNAVAILABLE',
      provider: null,
      message:
        'Tax filing is unavailable until a backend tax provider is configured.',
    };
  }

  async taxOverview(userId: string) {
    await this.assertProductAccess(userId, 'foreign_tax');
    return {
      enabled: false,
      provider: null,
      returnsFiledCount: null,
      pendingCount: null,
      balanceDue: null,
      currency: null,
      filings: [],
      documents: [],
      message:
        'Tax filing data is unavailable until a backend tax provider is configured.',
    };
  }

  async blockTaxOperation(userId: string, payload: AnyRecord, type: string) {
    await this.assertProductAccess(userId, 'foreign_tax');
    await this.recordBlockedOperation(userId, type, payload, {
      provider: 'Tax provider',
      capability: 'tax',
      reason: 'Tax filing submission requires a configured tax provider.',
    });
  }

  async blockLoanOperation(userId: string, payload: AnyRecord, type: string) {
    await this.assertProductAccess(userId, 'lending');
    await this.recordBlockedOperation(userId, type, payload, {
      provider: 'Unit.co',
      capability: 'usd_loan_application',
      reason:
        'Loan offers, approval, disbursement, and repayment require a live Unit credit program integration.',
    });
  }

  async loanOverview(userId: string) {
    await this.assertProductAccess(userId, 'lending');
    return {
      enabled: false,
      provider: 'Unit.co',
      message:
        'USD loans are unavailable until Unit credit support is configured and live-tested.',
      loans: [],
    };
  }

  async loanUnavailable(userId: string, capability: ProviderCapability) {
    await this.assertProductAccess(userId, 'lending');
    this.throwProviderUnavailable({
      feature: 'Loans',
      capability,
      provider: 'Unit.co',
      reason:
        'The backend has no live-tested Unit credit program integration for this loan action.',
      missingRequirements:
        this.providerStatusService.getStatus(capability).missingEnvVars,
    });
  }

  async rewardsDashboard(userId: string) {
    await this.findUser(userId);
    const entries = await this.rewardLedgerRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    const summary = this.buildRewardSummary(entries);
    return {
      enabled: true,
      provider: 'VidalPay',
      unit: 'POINTS',
      currency: null,
      ...summary,
      redemption: {
        enabled: false,
        reason:
          'Reward redemption requires an approved redemption policy and wallet-credit workflow before points can be converted or paid out.',
      },
      history: entries.map((entry) => this.normalizeRewardEntry(entry)),
      message:
        entries.length === 0
          ? 'No reward entries have been recorded for this account yet.'
          : null,
    };
  }

  async rewardsHistory(userId: string) {
    await this.findUser(userId);
    const entries = await this.rewardLedgerRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return {
      rewards: entries.map((entry) => this.normalizeRewardEntry(entry)),
      history: entries.map((entry) => this.normalizeRewardEntry(entry)),
      nextCursor: null,
    };
  }

  async redeemRewards(userId: string, payload: AnyRecord) {
    await this.findUser(userId);
    await this.recordBlockedOperation(userId, 'rewards_redeem', payload, {
      provider: 'VidalPay',
      capability: 'rewards',
      reason:
        'Reward ledger history is available, but redemption is blocked until VidalPay defines the points-to-value policy, approval flow, and wallet-credit journal.',
    });
  }

  async referralsDashboard(userId: string) {
    const user = await this.findUser(userId);
    const referralCode = await this.ensureReferralCode(user);
    const [events, earnings] = await Promise.all([
      this.referralEventRepository.find({
        where: { referrerUserId: user.id },
        order: { createdAt: 'DESC' },
      }),
      this.rewardLedgerRepository.find({
        where: { userId: user.id, source: 'REFERRAL' },
        order: { createdAt: 'DESC' },
      }),
    ]);
    const referralRewardSummary = this.buildRewardSummary(earnings);

    return {
      referralCode,
      inviteTrackingEnabled: true,
      invitedCount: events.length,
      acceptedCount: events.filter((event) =>
        ['SIGNED_UP', 'KYC_VERIFIED', 'REWARDED'].includes(event.status),
      ).length,
      rewardedCount: events.filter((event) => event.status === 'REWARDED')
        .length,
      earnings: earnings.map((entry) => this.normalizeRewardEntry(entry)),
      rewardSummary: referralRewardSummary,
      events: events.map((event) => this.normalizeReferralEvent(event)),
      message:
        events.length === 0
          ? 'Referral code is available. No referral invites have been tracked yet.'
          : null,
    };
  }

  async referralEarnings(userId: string) {
    await this.findUser(userId);
    const earnings = await this.rewardLedgerRepository.find({
      where: { userId, source: 'REFERRAL' },
      order: { createdAt: 'DESC' },
    });

    return {
      earnings: earnings.map((entry) => this.normalizeRewardEntry(entry)),
      rewardSummary: this.buildRewardSummary(earnings),
    };
  }

  async trackReferralInvite(userId: string, payload: AnyRecord) {
    const user = await this.findUser(userId);
    const referralCode = await this.ensureReferralCode(user);
    const inviteeEmail =
      this.asString(payload.inviteeEmail) ?? this.asString(payload.email);
    const inviteePhoneNumber =
      this.asString(payload.inviteePhoneNumber) ??
      this.asString(payload.phoneNumber);

    if (!inviteeEmail && !inviteePhoneNumber) {
      throw new BadRequestException(
        'inviteeEmail or inviteePhoneNumber is required',
      );
    }

    const idempotencyKey =
      this.asString(payload.idempotencyKey) ??
      this.asString(payload.reference) ??
      `referral_invite_${randomUUID()}`;
    const existing = await this.referralEventRepository.findOne({
      where: { referrerUserId: user.id, idempotencyKey },
    });

    if (existing) {
      return {
        tracked: true,
        referralCode,
        invite: this.normalizeReferralEvent(existing),
        message:
          'Referral invite was already tracked for this idempotency key. No duplicate reward was created.',
      };
    }

    const invite = await this.referralEventRepository.save(
      this.referralEventRepository.create({
        referrerUserId: user.id,
        referredUserId: null,
        referralCode,
        inviteeEmail,
        inviteePhoneNumber,
        status: 'INVITED',
        reference: idempotencyKey,
        idempotencyKey,
        rewardLedgerEntryId: null,
        metadata: {
          channel: this.asString(payload.channel),
          campaign: this.asString(payload.campaign),
        },
      }),
    );

    return {
      tracked: true,
      referralCode,
      invite: this.normalizeReferralEvent(invite),
      rewardCreated: false,
      message:
        'Referral invite was tracked. No earning is posted until the referred user completes the backend-defined qualifying action.',
    };
  }

  async blockGenericOperation(
    userId: string,
    type: string,
    capability: ProviderCapability,
    payload: AnyRecord = {},
  ) {
    await this.assertCapabilityProductAccess(userId, capability);
    await this.recordBlockedOperation(userId, type, payload, {
      provider: this.providerStatusService.getStatus(capability).provider,
      capability,
      reason: `${type} is not backed by a live provider flow yet.`,
    });
  }

  async handleProviderWebhook(
    provider: string,
    payload: AnyRecord,
    signature?: string,
  ) {
    this.assertProviderWebhookSignature(provider, payload, signature);

    const reference =
      this.asString(payload.reference) ??
      this.asString(payload.providerReference) ??
      this.asString(payload.transactionReference);
    const status =
      this.asString(payload.status) ??
      this.asString(payload.event) ??
      'RECEIVED';

    if (reference) {
      const operation = await this.providerOperationRepository.findOne({
        where: [{ reference }, { providerReference: reference }],
      });
      if (operation) {
        operation.status = status.toUpperCase();
        operation.responsePayload = this.redactPayload(payload);
        await this.providerOperationRepository.save(operation);
      }
    }

    return { received: true, provider, reference: reference ?? null, status };
  }

  verifyWhatsAppWebhook(query: AnyRecord) {
    const mode = this.asString(query['hub.mode'] ?? query.mode);
    const token = this.asString(
      query['hub.verify_token'] ?? query.verify_token,
    );
    const challenge = this.asString(query['hub.challenge'] ?? query.challenge);
    const expected = this.configService.get<string>(
      'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
    );
    if (!expected) {
      throw new ServiceUnavailableException(
        createBlockedResponse({
          code: 'WHATSAPP_WEBHOOK_NOT_CONFIGURED',
          feature: 'WhatsApp webhook verification',
          capability: 'whatsapp_support',
          provider: 'WhatsApp Cloud API',
          reason:
            'WHATSAPP_WEBHOOK_VERIFY_TOKEN is not configured in the backend environment.',
          missingRequirements: ['WHATSAPP_WEBHOOK_VERIFY_TOKEN'],
          retryable: false,
        }),
      );
    }
    if (mode !== 'subscribe' || token !== expected || !challenge) {
      throw new UnauthorizedException('Invalid WhatsApp webhook verification');
    }
    return challenge;
  }

  async handleWhatsAppWebhook(payload: AnyRecord, signature?: string) {
    this.assertGenericWebhookSignature({
      provider: 'WhatsApp Cloud API',
      capability: 'whatsapp_support',
      secretKey: 'WHATSAPP_APP_SECRET',
      signature,
      payload,
      signaturePrefix: 'sha256=',
      requiredInProduction: false,
    });
    const eventId =
      this.asString(payload.entry?.[0]?.id) ??
      this.asString(payload.id) ??
      `whatsapp_${createHash('sha256')
        .update(JSON.stringify(payload))
        .digest('hex')}`;
    const existing = await this.providerOperationRepository.findOne({
      where: { type: 'whatsapp_webhook', idempotencyKey: eventId },
    });
    if (existing) {
      return {
        received: true,
        provider: 'WhatsApp Cloud API',
        duplicate: true,
        reference: existing.reference,
      };
    }
    await this.providerOperationRepository.save(
      this.providerOperationRepository.create({
        userId: 'SYSTEM',
        type: 'whatsapp_webhook',
        idempotencyKey: eventId,
        reference: eventId,
        status: 'RECEIVED',
        provider: 'WhatsApp Cloud API',
        requestPayload: this.redactPayload(payload),
        metadata: {
          persistence: 'PROVIDER_OPERATION_ONLY',
          message:
            'Dedicated support_conversation/support_message tables are required before WhatsApp can become the production live-chat source of truth.',
        },
      }),
    );
    return {
      received: true,
      provider: 'WhatsApp Cloud API',
      duplicate: false,
      reference: eventId,
    };
  }

  async handleZendeskWebhook(payload: AnyRecord, signature?: string) {
    this.assertGenericWebhookSignature({
      provider: 'Zendesk',
      capability: 'zendesk_support',
      secretKey: 'ZENDESK_WEBHOOK_SECRET',
      signature,
      payload,
      signaturePrefix: 'sha256=',
      requiredInProduction: false,
    });
    const ticketId =
      this.asString(this.asRecord(payload.ticket)?.id) ??
      this.asString(payload.ticket_id) ??
      this.asString(payload.id);
    const eventId =
      this.asString(payload.event_id) ??
      this.asString(payload.eventId) ??
      `zendesk_${createHash('sha256')
        .update(JSON.stringify(payload))
        .digest('hex')}`;
    const existing = await this.providerOperationRepository.findOne({
      where: { type: 'zendesk_webhook', idempotencyKey: eventId },
    });
    if (!existing) {
      await this.providerOperationRepository.save(
        this.providerOperationRepository.create({
          userId: 'SYSTEM',
          type: 'zendesk_webhook',
          idempotencyKey: eventId,
          reference: eventId,
          status: this.asString(payload.status)?.toUpperCase() ?? 'RECEIVED',
          provider: 'Zendesk',
          providerReference: ticketId ?? null,
          requestPayload: this.redactPayload(payload),
          metadata: {
            ticketId: ticketId ?? null,
            persistence: 'PROVIDER_OPERATION_ONLY',
          },
        }),
      );
    }
    return {
      received: true,
      provider: 'Zendesk',
      duplicate: Boolean(existing),
      providerReference: ticketId ?? null,
    };
  }

  async handleFincraWebhook(payload: AnyRecord, signature?: string) {
    this.assertFincraWebhookSignature(payload, signature);

    const reference = this.fincraWebhookReference(payload);
    const status = this.fincraWebhookStatus(payload);
    let updated = false;
    let walletUpdated = false;
    let operation: ProviderOperation | null = null;

    if (reference) {
      operation = await this.providerOperationRepository.findOne({
        where: [
          { reference },
          { providerReference: reference },
          { idempotencyKey: reference },
        ],
      });
      if (operation) {
        const eventId = this.fincraWebhookEventId(payload);
        const eventRecord = await this.recordFincraWebhookEvent({
          eventId,
          reference,
          operationId: operation.id,
          status,
          payload,
        });
        const processedEventIds = this.providerOperationEventIds(operation);
        if (
          eventRecord.duplicate ||
          (eventId && processedEventIds.includes(eventId))
        ) {
          return {
            received: true,
            provider: 'FINCRA',
            reference,
            status,
            updated: false,
            duplicate: true,
            activationReference: operation.reference,
            walletUpdated: false,
          };
        }
        const walletUpdate = await this.persistFincraWalletFromWebhook(
          operation,
          payload,
          status,
        );
        walletUpdated = walletUpdate.persisted;
        operation.status = walletUpdate.persisted ? 'ACTIVE' : status;
        operation.responsePayload = this.safeFincraWebhookPayload(payload);
        operation.metadata = {
          ...(operation.metadata ?? {}),
          providerWebhookReceived: true,
          providerWebhookStatus: status,
          providerWebhookEventId: eventId,
          providerWebhookEventIds: this.appendLimitedUnique(
            processedEventIds,
            eventId,
            20,
          ),
          providerAccountDetailsAvailable:
            this.fincraWebhookHasAccountDetails(payload),
          walletPersistenceBlocked: walletUpdate.persisted
            ? null
            : 'Provider account details were not persisted because the webhook did not contain approved/active real account details or wallet storage is not ready.',
          walletPersistenceStatus: walletUpdate.status,
          walletId: walletUpdate.walletId,
        };
        await this.providerOperationRepository.save(operation);
        updated = true;
      }
    }

    return {
      received: true,
      provider: 'FINCRA',
      reference: reference ?? null,
      status,
      updated,
      activationReference: operation?.reference ?? null,
      walletUpdated,
    };
  }

  async handleVtuWebhook(payload: AnyRecord, signature?: string) {
    this.assertGenericWebhookSignature({
      provider: 'VTU provider',
      capability: 'vtu_requery',
      secretKey: 'VTU_WEBHOOK_SECRET',
      signature,
      payload,
      signaturePrefix: 'sha256=',
      requiredInProduction: false,
    });
    const reference =
      this.asString(payload.reference) ??
      this.asString(payload.request_id) ??
      this.asString(payload.transactionId);
    if (reference) {
      const operation = await this.providerOperationRepository.findOne({
        where: [{ reference }, { providerReference: reference }],
      });
      if (operation) {
        operation.responsePayload = this.redactPayload(payload);
        operation.metadata = {
          ...(operation.metadata ?? {}),
          vtuWebhookReceived: true,
          finalizationBlocked:
            'Ledger/hold finalization is not enabled until the VTU provider contract and reconciliation flow are live-tested.',
        };
        await this.providerOperationRepository.save(operation);
      }
    }
    return {
      received: true,
      provider: 'VTU provider',
      reference: reference ?? null,
      finalized: false,
    };
  }

  async ensureCustomerWallets(userId: string) {
    const wallets = await this.walletRepository.find({ where: { userId } });
    const byCurrency = new Map(
      wallets.map((wallet) => [wallet.currency, wallet]),
    );
    const created: Wallet[] = [];

    for (const currency of supportedCurrencies) {
      if (!byCurrency.has(currency)) {
        created.push(
          this.walletRepository.create({
            userId,
            currency,
            balance: 0,
            availableBalance: 0,
            ledgerBalance: 0,
            provider: currency === Currency.USD ? 'Unit.co' : 'PayVessel',
            providerStatus: this.providerReadinessForCurrency(currency),
          }),
        );
      }
    }

    if (created.length > 0) {
      await this.walletRepository.save(created);
    }

    return this.walletRepository.find({
      where: { userId },
      order: { currency: 'ASC' },
    });
  }

  private async ensureWallet(userId: string, currency: Currency) {
    await this.ensureCustomerWallets(userId);
    const wallet = await this.walletRepository.findOne({
      where: { userId, currency },
    });
    if (!wallet) {
      throw new NotFoundException(`${currency} wallet not found`);
    }
    return wallet;
  }

  private async evaluateWalletEligibility(
    user: User,
    currency: string,
    knownWallets?: Wallet[],
  ) {
    const normalizedCurrency =
      this.walletProductCatalogService.normalizeCurrency(currency);
    const product = this.walletProductCatalogService.find(normalizedCurrency);
    const jurisdiction =
      this.productEligibilityService.capabilities(user).jurisdiction;
    const wallets =
      knownWallets ??
      (await this.walletRepository.find({ where: { userId: user.id } }));
    const activeWallet =
      wallets.find((wallet) => wallet.currency === normalizedCurrency) ?? null;
    const pendingActivation = await this.findWalletActivationOperation(
      user.id,
      normalizedCurrency,
    );

    if (!product) {
      return {
        currency: normalizedCurrency,
        available: false,
        eligible: false,
        canRequest: false,
        status: 'PRODUCT_UNAVAILABLE',
        reason:
          'This currency is not in the Vidal Pay Fincra-enabled wallet product catalogue.',
        jurisdiction,
        product: null,
        activeWallet: null,
        pendingActivation: null,
        satisfiedRequirements: [],
        missingRequirements: ['ENABLED_WALLET_PRODUCT'],
      };
    }

    if (!product.enabled) {
      return {
        currency: normalizedCurrency,
        available: false,
        eligible: false,
        canRequest: false,
        status: 'PRODUCT_DISABLED',
        reason: `${normalizedCurrency} wallet product is disabled for Vidal Pay.`,
        jurisdiction,
        product: this.normalizeWalletProduct(product),
        activeWallet: null,
        pendingActivation: null,
        satisfiedRequirements: [],
        missingRequirements: ['ENABLED_WALLET_PRODUCT'],
      };
    }

    if (!product.supportedJurisdictions.includes(jurisdiction.jurisdiction)) {
      return {
        currency: normalizedCurrency,
        available: false,
        eligible: false,
        canRequest: false,
        status: 'JURISDICTION_NOT_SUPPORTED',
        reason: `${normalizedCurrency} wallet is not enabled for this account jurisdiction.`,
        jurisdiction,
        product: this.normalizeWalletProduct(product),
        activeWallet: null,
        pendingActivation: null,
        satisfiedRequirements: [],
        missingRequirements: ['SUPPORTED_ACCOUNT_JURISDICTION'],
      };
    }

    const requirementEvaluation = await this.evaluateWalletRequirements(
      user,
      product,
    );

    if (activeWallet) {
      return {
        currency: normalizedCurrency,
        available: false,
        eligible: false,
        canRequest: false,
        status: 'ACTIVE',
        reason: 'The customer already has an active wallet for this currency.',
        jurisdiction,
        product: this.normalizeWalletProduct(product),
        activeWallet: this.normalizeWallet(activeWallet),
        pendingActivation: null,
        ...requirementEvaluation,
      };
    }

    if (pendingActivation?.status === 'PENDING') {
      return {
        currency: normalizedCurrency,
        available: false,
        eligible: false,
        canRequest: false,
        status: 'PENDING',
        reason: 'A wallet activation request is already pending.',
        jurisdiction,
        product: this.normalizeWalletProduct(product),
        activeWallet: null,
        pendingActivation: this.normalizeProviderOperation(pendingActivation),
        ...requirementEvaluation,
      };
    }

    if (requirementEvaluation.missingRequirements.length > 0) {
      return {
        currency: normalizedCurrency,
        available: true,
        eligible: false,
        canRequest: true,
        status: 'REQUIRES_INFORMATION',
        reason: 'Additional information is required before activation.',
        jurisdiction,
        product: this.normalizeWalletProduct(product),
        activeWallet: null,
        pendingActivation: pendingActivation
          ? this.normalizeProviderOperation(pendingActivation)
          : null,
        ...requirementEvaluation,
      };
    }

    const provider =
      this.walletProductCatalogService.providerConfigured(product);

    return {
      currency: normalizedCurrency,
      available: true,
      eligible: provider.configured,
      canRequest: true,
      status: provider.configured ? 'ELIGIBLE' : 'PROVIDER_NOT_CONFIGURED',
      reason: provider.configured
        ? 'All configured requirements are satisfied.'
        : provider.blockedResponse.reason,
      jurisdiction,
      product: this.normalizeWalletProduct(product),
      activeWallet: null,
      pendingActivation: pendingActivation
        ? this.normalizeProviderOperation(pendingActivation)
        : null,
      ...requirementEvaluation,
      providerReadiness: {
        provider: 'FINCRA',
        configured: provider.configured,
        missingRequirements: provider.missingRequirements,
      },
    };
  }

  private async evaluateWalletRequirements(user: User, product: WalletProduct) {
    const kyc = await this.getKycProfileForSession(user);
    const satisfiedRequirements: Array<{
      key: string;
      label: string;
      source: string;
    }> = [];
    const missingRequirements: Array<{
      key: string;
      label: string;
      source: string;
      providerReference?: string | null;
    }> = [];

    for (const requirement of product.requirements) {
      if (this.isWalletRequirementSatisfied(requirement, user, kyc)) {
        satisfiedRequirements.push({
          key: requirement.key,
          label: requirement.label,
          source: requirement.source,
        });
      } else {
        missingRequirements.push({
          key: requirement.key,
          label: requirement.label,
          source: requirement.source,
          providerReference: requirement.providerReference ?? null,
        });
      }
    }

    return {
      requirementsConfigured: product.requirementsConfigured,
      satisfiedRequirements,
      missingRequirements,
    };
  }

  private isWalletRequirementSatisfied(
    requirement: WalletProductRequirement,
    user: User,
    kyc: KycProfile,
  ) {
    const identity = this.asRecord(kyc.identity) ?? {};
    const sections = Array.isArray(kyc.sections) ? kyc.sections : [];
    const uploads = Array.isArray(kyc.uploads) ? kyc.uploads : [];
    const key = requirement.key.toLowerCase();

    if (key === 'legal_name') {
      return Boolean(
        (this.asString(user.firstName) && this.asString(user.lastName)) ||
        this.asString(identity.legalName) ||
        this.asString(identity.fullName),
      );
    }
    if (key === 'date_of_birth') {
      return Boolean(
        this.asString(user.dateOfBirth) || this.asString(identity.dateOfBirth),
      );
    }
    if (key === 'address') {
      return Boolean(
        this.asString(identity.address) ||
        this.asString(identity.residentialAddress) ||
        sections.some(
          (section) =>
            this.asString(section.section)?.toUpperCase() === 'ADDRESS' &&
            ['SUBMITTED', 'UNDER_REVIEW', 'VERIFIED'].includes(
              String(section.status),
            ),
        ),
      );
    }
    if (key === 'government_id') {
      return Boolean(
        this.asString(identity.nin) ||
        this.asString(identity.bvn) ||
        this.asString(identity.idNumber) ||
        this.asString(identity.documentNumber) ||
        sections.some(
          (section) =>
            this.asString(section.section)?.toUpperCase() === 'GOVERNMENT_ID' &&
            ['SUBMITTED', 'UNDER_REVIEW', 'VERIFIED'].includes(
              String(section.status),
            ),
        ),
      );
    }
    if (key === 'proof_of_address') {
      return uploads.some((upload) => {
        const type = this.asString(upload.type)?.toLowerCase();
        const section = this.asString(upload.section)?.toLowerCase();
        return (
          type === 'proof_of_address' ||
          type === 'address' ||
          section === 'address'
        );
      });
    }

    return Boolean(identity[key]);
  }

  private fincraWebhookReference(payload: AnyRecord) {
    const data = this.asRecord(payload.data) ?? {};
    const account =
      this.asRecord(data.account) ?? this.asRecord(payload.account) ?? {};
    return (
      this.asString(payload.reference) ??
      this.asString(payload.providerReference) ??
      this.asString(payload.requestId) ??
      this.asString(payload.requestID) ??
      this.asString(payload.virtualAccountRequestId) ??
      this.asString(data.reference) ??
      this.asString(data.id) ??
      this.asString(data._id) ??
      this.asString(data.requestId) ??
      this.asString(account.reference) ??
      this.asString(account.id) ??
      null
    );
  }

  private fincraWebhookStatus(payload: AnyRecord) {
    const data = this.asRecord(payload.data) ?? {};
    const raw =
      this.asString(payload.status) ??
      this.asString(payload.event) ??
      this.asString(payload.type) ??
      this.asString(data.status) ??
      this.asString(data.state) ??
      'RECEIVED';
    return raw.toUpperCase();
  }

  private fincraWebhookEventId(payload: AnyRecord) {
    const data = this.asRecord(payload.data) ?? {};
    return (
      this.asString(payload.eventId) ??
      this.asString(payload.eventID) ??
      this.asString(payload.id) ??
      this.asString(payload._id) ??
      this.asString(data.eventId) ??
      this.asString(data.eventID) ??
      null
    );
  }

  private providerOperationEventIds(operation: ProviderOperation) {
    const metadata = this.asRecord(operation.metadata) ?? {};
    const raw = metadata.providerWebhookEventIds;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((value) => this.asString(value))
      .filter((value): value is string => Boolean(value));
  }

  private appendLimitedUnique(
    values: string[],
    next: string | null,
    limit: number,
  ) {
    const normalized = [...values];
    if (next && !normalized.includes(next)) normalized.push(next);
    return normalized.slice(Math.max(0, normalized.length - limit));
  }

  private fincraWebhookHasAccountDetails(payload: AnyRecord) {
    const data = this.asRecord(payload.data) ?? {};
    const account =
      this.asRecord(data.account) ?? this.asRecord(payload.account) ?? {};
    return Boolean(
      this.asString(account.accountNumber) ??
      this.asString(account.account_number) ??
      this.asString(data.accountNumber) ??
      this.asString(data.account_number),
    );
  }

  private async recordFincraWebhookEvent(input: {
    eventId: string | null;
    reference: string;
    operationId: string;
    status: string;
    payload: AnyRecord;
  }) {
    if (!input.eventId) return { duplicate: false, stored: false };
    try {
      await this.fincraWebhookEventRepository.save(
        this.fincraWebhookEventRepository.create({
          provider: 'FINCRA',
          eventId: input.eventId,
          reference: input.reference,
          operationId: input.operationId,
          status: input.status,
          payloadSummary: this.safeFincraWebhookPayload(input.payload),
        }),
      );
      return { duplicate: false, stored: true };
    } catch (error) {
      if (this.isDuplicateKey(error)) return { duplicate: true, stored: false };
      if (this.isMissingTable(error, 'fincra_webhook_event')) {
        return { duplicate: false, stored: false };
      }
      throw error;
    }
  }

  private async persistFincraWalletFromWebhook(
    operation: ProviderOperation,
    payload: AnyRecord,
    status: string,
  ) {
    const details = this.fincraWebhookAccountDetails(payload);
    if (!this.isFincraWalletActiveStatus(status) || !details.accountNumber) {
      return {
        persisted: false,
        status: 'NO_APPROVED_ACCOUNT_DETAILS',
        walletId: null,
      };
    }
    if (!operation.userId || !operation.currency) {
      return {
        persisted: false,
        status: 'MISSING_OPERATION_OWNER_OR_CURRENCY',
        walletId: null,
      };
    }
    const currency = this.walletProductCatalogService.normalizeCurrency(
      operation.currency,
    );
    if (!currency || !Object.values(Currency).includes(currency as Currency)) {
      return {
        persisted: false,
        status: 'UNSUPPORTED_WALLET_CURRENCY',
        walletId: null,
      };
    }

    let wallet = await this.walletRepository.findOne({
      where: { userId: operation.userId, currency: currency as Currency },
    });
    if (!wallet) {
      wallet = this.walletRepository.create({
        userId: operation.userId,
        currency: currency as Currency,
        balance: 0,
        withdrawalSuspended: false,
      });
    }

    wallet.accountNumber = details.accountNumber;
    wallet.accountName = details.accountName ?? wallet.accountName ?? null;
    wallet.bankName = details.bankName ?? wallet.bankName ?? null;
    wallet.routingNumber =
      details.routingNumber ?? wallet.routingNumber ?? null;
    wallet.sortCode = details.sortCode ?? wallet.sortCode ?? null;
    wallet.address = details.address ?? wallet.address ?? null;
    wallet.provider = 'FINCRA';
    wallet.providerAccountId =
      details.providerAccountId ?? wallet.providerAccountId ?? null;
    wallet.providerVirtualAccountId =
      details.providerVirtualAccountId ??
      wallet.providerVirtualAccountId ??
      null;
    wallet.providerReference =
      operation.providerReference ?? operation.reference;
    wallet.providerStatus = 'ACTIVE';
    wallet.metadata = {
      ...(wallet.metadata ?? {}),
      source: 'fincra_webhook',
      activationOperationId: operation.id,
      activationReference: operation.reference,
      providerWebhookStatus: status,
      providerAccountDetailsPersistedAt: new Date().toISOString(),
    };

    const saved = await this.walletRepository.save(wallet);
    return {
      persisted: true,
      status: 'PERSISTED',
      walletId: saved.id ?? wallet.id ?? null,
    };
  }

  private fincraWebhookAccountDetails(payload: AnyRecord) {
    const data = this.asRecord(payload.data) ?? {};
    const account =
      this.asRecord(data.account) ?? this.asRecord(payload.account) ?? {};
    const bank = this.asRecord(account.bank) ?? this.asRecord(data.bank) ?? {};
    return {
      accountNumber:
        this.asString(account.accountNumber) ??
        this.asString(account.account_number) ??
        this.asString(data.accountNumber) ??
        this.asString(data.account_number) ??
        null,
      accountName:
        this.asString(account.accountName) ??
        this.asString(account.account_name) ??
        this.asString(data.accountName) ??
        this.asString(data.account_name) ??
        null,
      bankName:
        this.asString(account.bankName) ??
        this.asString(account.bank_name) ??
        this.asString(bank.name) ??
        this.asString(data.bankName) ??
        null,
      routingNumber:
        this.asString(account.routingNumber) ??
        this.asString(account.routing_number) ??
        null,
      sortCode:
        this.asString(account.sortCode) ??
        this.asString(account.sort_code) ??
        null,
      address:
        this.asString(account.address) ?? this.asString(data.address) ?? null,
      providerAccountId:
        this.asString(account.id) ??
        this.asString(account._id) ??
        this.asString(data.accountId) ??
        null,
      providerVirtualAccountId:
        this.asString(data.virtualAccountId) ??
        this.asString(data.id) ??
        this.asString(data._id) ??
        null,
    };
  }

  private isFincraWalletActiveStatus(status: string) {
    return ['APPROVED', 'ACTIVE', 'COMPLETED', 'SUCCESSFUL', 'SUCCESS'].some(
      (candidate) => status.includes(candidate),
    );
  }

  private safeFincraWebhookPayload(payload: AnyRecord) {
    return this.redactPayload({
      event: this.asString(payload.event) ?? this.asString(payload.type),
      status: this.fincraWebhookStatus(payload),
      reference: this.fincraWebhookReference(payload),
      hasAccountDetails: this.fincraWebhookHasAccountDetails(payload),
    });
  }

  private buildFincraVirtualAccountRequest(
    user: User,
    product: WalletProduct,
    payload: AnyRecord,
    activationKey: string,
  ): FincraVirtualAccountRequestPayload {
    const identity = this.asRecord(payload.KYCInformation) ?? {};
    const metadata = this.asRecord(payload.metadata) ?? {};
    const request: FincraVirtualAccountRequestPayload = {
      currency: product.currency,
      accountType: 'individual',
      KYCInformation: this.compactRecord({
        ...this.fincraKycInformationFromUser(user),
        ...identity,
      }),
      isTermsAccepted:
        payload.isTermsAccepted === true || payload.termsAccepted === true,
      merchantReference: activationKey,
      phoneNumber: this.asString(user.phoneNumber) ?? undefined,
      metadata: {
        ...metadata,
        vidalPayUserId: user.id,
        activationReference: activationKey,
        productTier: product.tier,
      },
    };

    const utilityBill = this.asString(payload.utilityBill);
    const bankStatement = this.asString(payload.bankStatement);
    const meansOfId = this.asString(payload.meansOfId);
    const accountAgreement = this.asString(payload.accountAgreement);
    const regulatoryEvidence = this.asString(payload.regulatoryEvidence);
    if (utilityBill) request.utilityBill = utilityBill;
    if (bankStatement) request.bankStatement = bankStatement;
    if (meansOfId) request.meansOfId = meansOfId;
    if (accountAgreement) request.accountAgreement = accountAgreement;
    if (regulatoryEvidence) request.regulatoryEvidence = regulatoryEvidence;
    return request;
  }

  private fincraKycInformationFromUser(user: User) {
    const userRecord = user as unknown as AnyRecord;
    return this.compactRecord({
      firstName: this.asString(user.firstName),
      lastName: this.asString(user.lastName),
      email: this.asString(user.email),
      phone: this.asString(user.phoneNumber),
      dateOfBirth: this.asString(user.dateOfBirth as unknown),
      nationality: this.asString(userRecord.nationality),
      country: this.asString(user.country),
      countryCode: this.asString(user.countryCode),
      address: this.compactRecord({
        state: this.asString(userRecord.stateOrRegion),
        city: this.asString(userRecord.city),
        street: this.asString(userRecord.addressLine1),
        postalCode: this.asString(userRecord.postalCode),
        country: this.asString(user.country),
        countryCode: this.asString(user.countryCode),
      }),
    });
  }

  private safeFincraActivationAuditPayload(payload: AnyRecord) {
    return this.redactPayload({
      currency: payload.currency,
      accountType: payload.accountType,
      hasKycInformation: Boolean(this.asRecord(payload.KYCInformation)),
      suppliedKycFields: Object.keys(
        this.asRecord(payload.KYCInformation) ?? {},
      ),
      suppliedDocuments: {
        utilityBill: Boolean(payload.utilityBill),
        bankStatement: Boolean(payload.bankStatement),
        meansOfId: Boolean(payload.meansOfId),
        accountAgreement: Boolean(payload.accountAgreement),
        regulatoryEvidence: Boolean(payload.regulatoryEvidence),
      },
      isTermsAccepted: payload.isTermsAccepted === true,
      metadata: this.asRecord(payload.metadata),
    });
  }

  private safeFincraActivationResponsePayload(result: {
    status: number;
    providerReference: string | null;
    requestStatus: string;
  }) {
    return {
      provider: 'FINCRA',
      httpStatus: result.status,
      providerReference: result.providerReference,
      requestStatus: result.requestStatus,
    };
  }

  private compactRecord(record: AnyRecord) {
    return Object.fromEntries(
      Object.entries(record).filter(([, value]) => {
        if (value === null || value === undefined || value === '') return false;
        if (typeof value === 'object' && !Array.isArray(value)) {
          return Object.keys(value).length > 0;
        }
        return true;
      }),
    );
  }

  private findWalletActivationOperation(userId: string, currency: string) {
    return this.providerOperationRepository.findOne({
      where: {
        userId,
        type: 'wallet_activation',
        idempotencyKey: this.walletActivationIdempotencyKey(userId, currency),
      },
    });
  }

  private walletActivationIdempotencyKey(userId: string, currency: string) {
    return `wallet_activation:${userId}:${currency}`;
  }

  private async getKycProfileSnapshot(user: User): Promise<KycProfile> {
    try {
      const existing = await this.kycProfileRepository.findOne({
        where: { userId: user.id },
      });
      if (existing) return existing;
    } catch (error) {
      if (!this.isKycProfileStorageUnavailable(error)) {
        throw error;
      }
    }

    const status = user.kycStatus ?? 'NOT_STARTED';
    const region = this.inferRegion(user);
    return this.kycProfileRepository.create({
      userId: user.id,
      region,
      provider: null,
      status,
      statusMessage: null,
      rejectionReason: null,
      providerReference: null,
      sections: this.defaultKycSections(region, status),
      uploads: [],
      identity: {},
      capabilities: this.capabilitiesForKycStatus(status),
      limits: this.defaultLimits(status),
    });
  }

  private normalizeWalletProduct(product: WalletProduct) {
    return {
      currency: product.currency,
      provider: product.provider,
      enabled: product.enabled,
      accountType: product.accountType,
      tier: product.tier,
      primary: product.tier === 'PRIMARY',
      additional: product.tier === 'ADDITIONAL',
      supportedJurisdictions: product.supportedJurisdictions,
      canProvision: product.canProvision,
      requirementsConfigured: product.requirementsConfigured,
      requirements: product.requirements,
      providerProductId: product.providerProductId,
      providerMetadata: product.providerMetadata,
    };
  }

  private normalizeProviderOperation(operation: ProviderOperation) {
    return {
      id: operation.id,
      reference: operation.reference,
      status: operation.status,
      currency: operation.currency,
      provider: operation.provider,
      providerReference: operation.providerReference,
      errorCode: operation.errorCode,
      failureReason: operation.failureReason,
      createdAt: operation.createdAt,
      updatedAt: operation.updatedAt,
    };
  }

  private async findUser(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['wallet'],
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }

  private normalizeTagLookup(tagId: string): string {
    return tagId
      .trim()
      .replace(/^[@$]+/, '')
      .toLowerCase();
  }

  private async findUserByTag(
    repository: Repository<User>,
    tagId: string,
  ): Promise<User | null> {
    const normalized = this.normalizeTagLookup(tagId);
    if (!normalized) return null;
    const builder = repository.createQueryBuilder('tag_user');
    if (typeof builder?.where !== 'function') {
      return repository.findOne({ where: { tagId } });
    }

    return builder
      .where(
        `LOWER(REGEXP_REPLACE(TRIM("tag_user"."tagId"), '^[@$]+', '')) = :normalized`,
        { normalized },
      )
      .getOne();
  }

  private async ensureLegacyUserTag(user: User) {
    if (this.asString(user.tagId)) return;
    const tagId = await TagIdGenerator.generateUniqueTagId(this.userRepository);
    await this.userRepository.update(user.id, { tagId });
    user.tagId = tagId;
  }

  private async getOrCreateKycProfile(user: User) {
    const existing = await this.kycProfileRepository.findOne({
      where: { userId: user.id },
    });
    if (existing) {
      return existing;
    }
    const status = user.kycStatus ?? 'NOT_STARTED';
    return this.kycProfileRepository.save(
      this.kycProfileRepository.create({
        userId: user.id,
        region: this.inferRegion(user),
        provider: null,
        status,
        sections: this.defaultKycSections(this.inferRegion(user), status),
        uploads: [],
        identity: {},
        capabilities: this.capabilitiesForKycStatus(status),
        limits: this.defaultLimits(status),
      }),
    );
  }

  private async getOrCreateNotificationPreference(userId: string) {
    const existing = await this.notificationPreferenceRepository.findOne({
      where: { userId },
    });
    if (existing) {
      return existing;
    }
    return this.notificationPreferenceRepository.save(
      this.notificationPreferenceRepository.create({
        userId,
        preferences: this.defaultNotificationPreferences(),
      }),
    );
  }

  private async createOtpToken(user: User, type: TokenType) {
    const token = Math.floor(100000 + Math.random() * 900000).toString();
    const expiration = new Date(Date.now() + 60 * 60 * 1000);
    return this.tokenRepository.save(
      this.tokenRepository.create({
        token,
        expiration,
        type,
        user,
      }),
    );
  }

  private async validateOtpToken(
    userId: string,
    token: string,
    type: TokenType,
  ) {
    const tokenEntity = await this.tokenRepository.findOne({
      where: {
        token,
        type,
        user: { id: userId },
      },
      relations: ['user'],
    });
    if (!tokenEntity || tokenEntity.expiration < new Date()) {
      throw new UnauthorizedException('Token is invalid or expired');
    }
    return tokenEntity;
  }

  private normalizeUser(user: User, wallets: Wallet[], kyc: KycProfile) {
    const { password, pin, resetToken, resetTokenExpiry, ...safeUser } = user;
    const region = kyc.region ?? user.region ?? this.inferRegion(user);
    const defaultCurrency =
      region === 'NG' ? Currency.NGN : region === 'US' ? Currency.USD : null;
    const orderedWallets = this.orderWalletsByDefault(wallets, defaultCurrency);
    return {
      ...safeUser,
      emailVerified: user.isVerified,
      wallet: orderedWallets.map((wallet) => this.normalizeWallet(wallet)),
      kyc: this.normalizeKycProfile(kyc),
      kycStatus: kyc.status,
      accountLevel: this.buildAccountLevel(user, kyc),
      region,
      walletPreference: {
        defaultCurrency,
        source: 'ACCOUNT_REGION',
      },
      provider: kyc.provider,
      capabilities:
        kyc.capabilities ?? this.capabilitiesForKycStatus(kyc.status),
      productAvailability: this.buildProductAvailability(region),
      limits: kyc.limits ?? this.defaultLimits(kyc.status),
      security: this.buildSecurityOverview(user),
      accountRails: this.buildAccountRails(orderedWallets, defaultCurrency),
      fundingMethods: this.buildFundingMethods(),
      pendingActions: this.buildPendingActions(user, kyc),
      hasTransactionPin: Boolean(user.pin),
    };
  }

  /**
   * Session restoration must remain available for databases created before the
   * optional KYC profile table was introduced. KYC mutation endpoints continue
   * to use getOrCreateKycProfile and therefore still fail honestly until their
   * required storage is provisioned.
   */
  private async getKycProfileForSession(user: User): Promise<KycProfile> {
    try {
      return await this.getOrCreateKycProfile(user);
    } catch (error) {
      if (!this.isKycProfileStorageUnavailable(error)) {
        throw error;
      }

      const status = user.kycStatus ?? 'NOT_STARTED';
      const region = this.inferRegion(user);
      return this.kycProfileRepository.create({
        userId: user.id,
        region,
        provider: null,
        status,
        statusMessage:
          'KYC profile storage is unavailable. Existing account access remains available.',
        rejectionReason: null,
        providerReference: null,
        sections: this.defaultKycSections(region, status),
        uploads: [],
        identity: {},
        capabilities: this.capabilitiesForKycStatus(status),
        limits: this.defaultLimits(status),
      });
    }
  }

  private isMissingTable(error: unknown, tableName: string) {
    const candidate = error as {
      code?: string;
      message?: string;
      driverError?: { code?: string; message?: string };
    };
    const code = candidate?.code ?? candidate?.driverError?.code;
    const message = `${candidate?.message ?? ''} ${candidate?.driverError?.message ?? ''}`;
    return (
      code === '42P01' &&
      message.toLowerCase().includes(tableName.toLowerCase()) &&
      /relation .* does not exist/i.test(message)
    );
  }

  private isKycProfileStorageUnavailable(error: unknown) {
    return (
      this.isMissingTable(error, 'kyc_profile') ||
      this.isMissingColumn(error, 'kyc_profile') ||
      this.isMissingColumn(error, 'region') ||
      this.isMissingColumn(error, 'provider') ||
      this.isMissingColumn(error, 'sections') ||
      this.isMissingColumn(error, 'uploads') ||
      this.isMissingColumn(error, 'identity') ||
      this.isMissingColumn(error, 'capabilities') ||
      this.isMissingColumn(error, 'limits')
    );
  }

  private isMissingColumn(error: unknown, columnName: string) {
    const candidate = error as {
      code?: string;
      message?: string;
      driverError?: { code?: string; message?: string };
    };
    const code = candidate?.code ?? candidate?.driverError?.code;
    const message =
      `${candidate?.message ?? ''} ${candidate?.driverError?.message ?? ''}`.toLowerCase();
    const normalizedColumn = columnName.toLowerCase();
    return (
      (code === '42703' ||
        code === 'ER_BAD_FIELD_ERROR' ||
        message.includes('column') ||
        message.includes('unknown column') ||
        message.includes('does not exist')) &&
      message.includes(normalizedColumn)
    );
  }

  private isDuplicateKey(error: unknown) {
    const candidate = error as {
      code?: string;
      message?: string;
      driverError?: { code?: string; message?: string };
    };
    const code = candidate?.code ?? candidate?.driverError?.code;
    const message =
      `${candidate?.message ?? ''} ${candidate?.driverError?.message ?? ''}`.toLowerCase();
    return (
      code === '23505' ||
      code === 'ER_DUP_ENTRY' ||
      message.includes('duplicate key')
    );
  }

  private throwMissingFeatureStorage(
    error: unknown,
    feature: string,
    tableName: string,
  ): never {
    if (!this.isMissingTable(error, tableName)) {
      throw error;
    }

    throw new ServiceUnavailableException(
      createBlockedResponse({
        code: 'FEATURE_STORAGE_UNAVAILABLE',
        feature,
        capability:
          feature === 'notifications' ? 'notifications' : 'bank_transfer',
        provider: 'VidalPay',
        reason: `${feature} storage is not present in the connected legacy database. No existing records were deleted by this request.`,
        missingRequirements: [
          `${tableName} table or a verified legacy-data adapter`,
        ],
        retryable: false,
      }),
    );
  }

  private normalizeAdminDirectoryUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      phoneNumber: user.phoneNumber ?? null,
      tagId: user.tagId ?? null,
      role: user.role,
      status: user.status,
      accountStatus: user.accountStatus ?? null,
      isVerified: user.isVerified,
      isPhoneVerified: user.isPhoneVerified,
      kycStatus: user.kycStatus ?? 'NOT_STARTED',
      kycProvider: null,
      signupRegion: this.inferRegion(user),
      defaultWalletCurrency:
        this.inferRegion(user) === 'NG'
          ? Currency.NGN
          : this.inferRegion(user) === 'US'
            ? Currency.USD
            : null,
      country: user.country ?? null,
      profilePicture: user.profilePicture ?? null,
      lastLogin: user.lastLogin ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private adminKycDocuments(kyc: KycProfile | null) {
    const uploads = Array.isArray(kyc?.uploads) ? kyc.uploads : [];
    return uploads.map((upload, index) => ({
      id: this.asString(upload.id) ?? `${kyc?.id ?? 'kyc'}-${index + 1}`,
      originalFileName:
        this.asString(upload.originalFileName) ??
        this.asString(upload.fileName) ??
        this.asString(upload.name) ??
        null,
      documentType:
        this.asString(upload.documentType) ??
        this.asString(upload.type) ??
        null,
      category: this.asString(upload.category) ?? null,
      stage:
        this.asString(upload.stage) ?? this.asString(upload.section) ?? null,
      storage: this.asString(upload.storage) ?? 'backend',
      sizeBytes: Number(upload.sizeBytes ?? upload.size ?? 0) || 0,
      uploadedAt:
        this.asString(upload.uploadedAt) ??
        this.asString(upload.createdAt) ??
        kyc?.updatedAt ??
        null,
      contentAccess: 'RESTRICTED',
    }));
  }

  private normalizeAdminAction(operation: ProviderOperation) {
    return {
      id: operation.id,
      action: operation.type,
      targetUserId: operation.userId,
      actorId: this.asString(operation.metadata?.adminUserId) ?? null,
      reason:
        this.asString(operation.metadata?.reason) ??
        operation.failureReason ??
        'No reason recorded',
      previousState: operation.requestPayload ?? null,
      newState: operation.responsePayload ?? null,
      createdAt: operation.createdAt,
    };
  }

  private normalizeAdminMoneyEvent(transaction: FinancialTransaction) {
    return {
      id: transaction.id,
      userId: transaction.userId,
      walletId: transaction.walletId,
      reference: transaction.reference,
      operationReference: transaction.operationReference,
      currency: transaction.currency,
      amount: transaction.amount,
      balanceBefore: transaction.balanceBefore,
      balanceAfter: transaction.balanceAfter,
      type: transaction.type,
      direction: transaction.type,
      status: transaction.status,
      info: transaction.info,
      description: transaction.description,
      tag: transaction.tag,
      provider: transaction.provider,
      providerReference: transaction.providerReference,
      idempotencyKey: transaction.idempotencyKey,
      metadata: transaction.metadata,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
    };
  }

  private normalizeAdminSupportTicket(ticket: SupportTicket) {
    return {
      id: ticket.id,
      userId: ticket.userId,
      category: ticket.category,
      subject: ticket.subject,
      message: ticket.message,
      priority: ticket.priority,
      status: ticket.status,
      preferredChannel: ticket.preferredChannel,
      resolutionSummary: ticket.resolutionSummary,
      metadata: ticket.metadata,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    };
  }

  private normalizeAdminProviderOperation(operation: ProviderOperation) {
    return {
      id: operation.id,
      userId: operation.userId,
      type: operation.type,
      operationType: operation.type,
      idempotencyKey: operation.idempotencyKey,
      reference: operation.reference,
      status: operation.status,
      amount: operation.amount,
      currency: operation.currency,
      provider: operation.provider,
      providerReference: operation.providerReference,
      requestPayload: operation.requestPayload,
      responsePayload: operation.responsePayload,
      errorCode: operation.errorCode,
      failureReason: operation.failureReason,
      metadata: operation.metadata,
      createdAt: operation.createdAt,
      updatedAt: operation.updatedAt,
    };
  }

  private normalizeAdminUser(user?: User) {
    if (!user) {
      return null;
    }
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      phoneNumber: user.phoneNumber ?? null,
      country: user.country ?? null,
      region: user.region ?? null,
      isVerified: user.isVerified,
      isPhoneVerified: user.isPhoneVerified,
      kycStatus: user.kycStatus ?? null,
      accountStatus: user.status,
    };
  }

  private normalizeWallet(wallet: Wallet) {
    return {
      id: wallet.id,
      currency: wallet.currency,
      balance: Number(wallet.balance ?? 0),
      availableBalance: Number(wallet.availableBalance ?? wallet.balance ?? 0),
      ledgerBalance: Number(wallet.ledgerBalance ?? wallet.balance ?? 0),
      accountNumber: wallet.accountNumber ?? null,
      accountName: wallet.accountName ?? null,
      bankName: wallet.bankName ?? null,
      routingNumber: wallet.routingNumber ?? null,
      address: wallet.address ?? null,
      provider:
        wallet.provider ??
        (wallet.currency === Currency.USD ? 'Unit.co' : 'PayVessel'),
      providerCustomerId: wallet.providerCustomerId ?? null,
      providerAccountId: wallet.providerAccountId ?? null,
      providerVirtualAccountId: wallet.providerVirtualAccountId ?? null,
      providerStatus:
        wallet.providerStatus ??
        this.providerReadinessForCurrency(wallet.currency),
      providerReference: wallet.providerReference ?? null,
      metadata: wallet.metadata ?? null,
      withdrawalSuspended: wallet.withdrawalSuspended,
      sortCode: wallet.sortCode ?? null,
      userId: wallet.userId,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    };
  }

  private normalizeCard(card: Card) {
    return {
      id: card.id,
      type: card.type,
      currency: card.currency,
      status: card.status,
      maskedPan: card.maskedPan,
      last4: card.last4,
      expiryMonth: card.expiryMonth,
      expiryYear: card.expiryYear,
      cardholderName: card.cardholderName,
      balance: card.balance,
      availableBalance: card.availableBalance,
      limits: card.limits ?? {},
      billingAddress: card.billingAddress ?? null,
      provider: card.provider,
      providerCardId: card.providerCardId,
      providerStatus: card.providerStatus,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
    };
  }

  private normalizeKycProfile(profile: KycProfile) {
    const identity = profile.identity ?? {};
    const actionRequired =
      this.asRecord(identity.actionRequired) ??
      (identity.actionRequired === true
        ? {
            required: true,
            missingRequirements: [],
            message: profile.statusMessage,
          }
        : null);
    const missingRequirements = this.normalizeStringList(
      Array.isArray(actionRequired?.missingRequirements)
        ? actionRequired.missingRequirements
        : Array.isArray(identity.missingRequirements)
          ? identity.missingRequirements
          : [],
    );
    return {
      id: profile.id,
      region: profile.region,
      provider: profile.provider,
      isSupportedRegion: profile.region === 'NG' || profile.region === 'US',
      status: profile.status,
      statusMessage: profile.statusMessage,
      rejectionReason: profile.rejectionReason,
      actionRequired: profile.status === 'RETRY_REQUIRED',
      missingRequirements,
      sections:
        profile.sections ??
        this.defaultKycSections(profile.region, profile.status),
      uploads: profile.uploads ?? [],
      capabilities:
        profile.capabilities ?? this.capabilitiesForKycStatus(profile.status),
      limits: profile.limits ?? this.defaultLimits(profile.status),
      identity,
      providerReference: profile.providerReference,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  private buildAccountLevel(user: User, kyc: KycProfile) {
    const kycStatus = kyc.status ?? user.kycStatus ?? 'NOT_STARTED';
    const emailVerified = Boolean(user.isVerified);
    const phoneVerified = Boolean(user.isPhoneVerified);
    const verified = kycStatus === 'VERIFIED';
    const submittedSections = (kyc.sections ?? []).filter((section) =>
      ['SUBMITTED', 'UNDER_REVIEW', 'VERIFIED'].includes(
        String(section.status).toUpperCase(),
      ),
    ).length;
    const rank = verified
      ? 4
      : submittedSections > 0 ||
          ['SUBMITTED', 'UNDER_REVIEW', 'MANUAL_REVIEW'].includes(kycStatus)
        ? 3
        : ['IN_PROGRESS', 'RETRY_REQUIRED'].includes(kycStatus)
          ? 2
          : 1;
    const codeByRank: Record<number, string> = {
      1: 'ACCOUNT_CREATED',
      2: kycStatus === 'RETRY_REQUIRED' ? 'KYC_ACTION_REQUIRED' : 'KYC_STARTED',
      3: 'KYC_DOCUMENTS_SUBMITTED',
      4: 'KYC_VERIFIED',
    };
    const level = codeByRank[rank];
    const requirements: string[] = [];

    if (!emailVerified) {
      requirements.push('VERIFY_EMAIL');
    }
    if (!phoneVerified) {
      requirements.push('VERIFY_PHONE');
    }
    if (!verified) {
      requirements.push('COMPLETE_KYC');
    }
    const normalizedMissingRequirements = this.normalizeStringList(
      Array.isArray((kyc.identity ?? {}).missingRequirements)
        ? ((kyc.identity ?? {}).missingRequirements as unknown[])
        : Array.isArray(
              this.asRecord((kyc.identity ?? {}).actionRequired)
                ?.missingRequirements,
            )
          ? (this.asRecord((kyc.identity ?? {}).actionRequired)
              ?.missingRequirements as unknown[])
          : [],
    );
    normalizedMissingRequirements.forEach((requirement) => {
      if (!requirements.includes(requirement)) {
        requirements.push(requirement);
      }
    });

    return {
      code: level,
      rank,
      level: rank,
      status: verified ? 'ACTIVE' : 'LIMITED',
      title: level
        .split('_')
        .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
        .join(' '),
      kycStatus,
      emailVerified,
      phoneVerified,
      requirements,
      missingRequirements: normalizedMissingRequirements,
      actionRequired: kycStatus === 'RETRY_REQUIRED',
      capabilities: this.capabilitiesForKycStatus(kycStatus),
      limits: kyc.limits ?? this.defaultLimits(kycStatus),
      message: verified
        ? 'KYC is verified. Provider-specific limits still depend on live provider provisioning.'
        : kycStatus === 'RETRY_REQUIRED'
          ? (kyc.statusMessage ??
            'More information is required to continue verification.')
          : 'Complete verification requirements to unlock bank transfers and provider-backed features.',
    };
  }

  private normalizeRewardEntry(entry: RewardLedgerEntry) {
    return {
      id: entry.id,
      type: entry.type,
      points: Number(entry.points ?? 0),
      signedPoints: this.rewardEntrySignedPoints(entry),
      unit: entry.unit ?? 'POINTS',
      currency: entry.currency ?? null,
      status: entry.status,
      source: entry.source ?? null,
      reference: entry.reference,
      relatedReference: entry.relatedReference ?? null,
      description: entry.description ?? null,
      postedAt: entry.postedAt ?? null,
      expiresAt: entry.expiresAt ?? null,
      metadata: entry.metadata ?? null,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };
  }

  private normalizeReferralEvent(event: ReferralEvent) {
    return {
      id: event.id,
      referralCode: event.referralCode,
      referredUserId: event.referredUserId ?? null,
      inviteeEmail: event.inviteeEmail ?? null,
      inviteePhoneNumber: event.inviteePhoneNumber ?? null,
      status: event.status,
      reference: event.reference,
      idempotencyKey: event.idempotencyKey ?? null,
      rewardLedgerEntryId: event.rewardLedgerEntryId ?? null,
      metadata: event.metadata ?? null,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };
  }

  private buildRewardSummary(entries: RewardLedgerEntry[]) {
    const posted = entries.filter((entry) => entry.status === 'POSTED');
    const pending = entries.filter((entry) => entry.status === 'PENDING');
    const balance = posted.reduce(
      (sum, entry) => sum + this.rewardEntrySignedPoints(entry),
      0,
    );
    const pendingBalance = pending.reduce(
      (sum, entry) => sum + this.rewardEntrySignedPoints(entry),
      0,
    );
    const lifetimeEarned = posted
      .map((entry) => this.rewardEntrySignedPoints(entry))
      .filter((points) => points > 0)
      .reduce((sum, points) => sum + points, 0);
    const lifetimeRedeemed = Math.abs(
      posted
        .map((entry) => this.rewardEntrySignedPoints(entry))
        .filter((points) => points < 0)
        .reduce((sum, points) => sum + points, 0),
    );

    return {
      balance: this.roundMoney(balance),
      availableBalance: this.roundMoney(balance),
      pendingBalance: this.roundMoney(pendingBalance),
      lifetimeEarned: this.roundMoney(lifetimeEarned),
      lifetimeRedeemed: this.roundMoney(lifetimeRedeemed),
      entryCount: entries.length,
    };
  }

  private rewardEntrySignedPoints(entry: RewardLedgerEntry) {
    const points = Number(entry.points ?? 0);
    const type = String(entry.type ?? '').toUpperCase();
    return ['REDEEM', 'REDEMPTION', 'EXPIRY', 'REVERSAL'].includes(type)
      ? -Math.abs(points)
      : points;
  }

  private async ensureReferralCode(user: User) {
    if (user.referralCode) {
      return user.referralCode;
    }

    const code = this.generateReferralCode(user);
    await this.userRepository.update(user.id, { referralCode: code });
    user.referralCode = code;
    return code;
  }

  private generateReferralCode(user: User) {
    const nameSeed = `${user.firstName ?? ''}${user.lastName ?? ''}`
      .replace(/[^a-z0-9]/gi, '')
      .slice(0, 4)
      .toUpperCase();
    const prefix = nameSeed || 'VIDAL';
    const suffix = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
    return `${prefix}${suffix}`.slice(0, 12);
  }

  private normalizeOperation(operation: ProviderOperation) {
    return {
      reference: operation.reference,
      status: operation.status,
      message: operation.failureReason,
      amount: operation.amount,
      currency: operation.currency,
      provider: operation.provider,
      providerReference: operation.providerReference,
      metadata: operation.metadata,
    };
  }

  private async assertTransactionPin(userId: string, pin: string) {
    const user = await this.findUser(userId);
    if (!user.pin) {
      throw new PreconditionFailedException('Transaction PIN has not been set');
    }
    const valid = await compare(pin, user.pin);
    if (!valid) {
      throw new PreconditionFailedException('Invalid transaction pin');
    }
  }

  private providerErrorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const data = error.response?.data as AnyRecord | string | undefined;
      if (typeof data === 'string') return data.slice(0, 300);
      return (
        this.asString(data?.message) ??
        this.asString(data?.error) ??
        `Provider request failed with status ${error.response?.status ?? 'unknown'}`
      );
    }
    return error instanceof Error ? error.message : 'Provider request failed';
  }

  private normalizeReloadlyCatalog(
    kind: 'airtime' | 'data' | 'utilities',
    response: AnyRecord,
  ) {
    const content = Array.isArray(response.content)
      ? response.content
      : Array.isArray(response.data)
        ? response.data
        : [];

    if (kind !== 'utilities') {
      return {
        networks: content.map((entry, index) => {
          const item = this.asRecord(entry) ?? {};
          return {
            id: this.asString(item.id) ?? String(item.operatorId ?? index + 1),
            code:
              this.asString(item.operatorCode) ??
              this.asString(item.name) ??
              `operator-${index + 1}`,
            name: this.asString(item.name) ?? `Operator ${index + 1}`,
            countryCode: this.asString(item.countryCode) ?? 'NG',
            denominationType: this.asString(item.denominationType),
            minAmount: item.minAmount ?? item.minAmountLocal ?? null,
            maxAmount: item.maxAmount ?? item.maxAmountLocal ?? null,
            bundles:
              kind === 'data' && Array.isArray(item.fixedAmountsDescriptions)
                ? item.fixedAmountsDescriptions
                : Array.isArray(item.bundles)
                  ? item.bundles
                  : [],
            metadata: this.redactPayload(item),
          };
        }),
      };
    }

    const categories = new Map<string, AnyRecord>();
    content.forEach((entry, index) => {
      const biller = this.asRecord(entry) ?? {};
      const categoryRecord = this.asRecord(biller.category) ?? {};
      const categoryCode =
        this.asString(categoryRecord.code) ??
        this.asString(categoryRecord.name) ??
        this.asString(biller.type) ??
        'utilities';
      const existing = categories.get(categoryCode) ?? {
        id: categoryCode,
        code: categoryCode,
        title:
          this.asString(categoryRecord.name) ??
          this.asString(biller.type) ??
          'Utilities',
        description: '',
        providers: [],
      };
      (existing.providers as AnyRecord[]).push({
        id: this.asString(biller.id) ?? String(index + 1),
        code:
          this.asString(biller.serviceType) ??
          this.asString(biller.id) ??
          String(index + 1),
        name: this.asString(biller.name) ?? `Biller ${index + 1}`,
        title: this.asString(biller.name) ?? `Biller ${index + 1}`,
        metadata: this.redactPayload(biller),
      });
      categories.set(categoryCode, existing);
    });
    return { categories: [...categories.values()] };
  }

  private normalizeVtuNgCatalog(
    kind: 'airtime' | 'data' | 'utilities',
    response: AnyRecord,
  ) {
    const content = Array.isArray(response.data)
      ? response.data
      : Array.isArray(response.content)
        ? response.content
        : Array.isArray(response.variations)
          ? response.variations
          : [];

    if (kind !== 'utilities') {
      return {
        networks: content.map((entry, index) => {
          const item = this.asRecord(entry) ?? {};
          return {
            id:
              this.asString(item.service_id) ??
              this.asString(item.variation_code) ??
              String(index + 1),
            code:
              this.asString(item.service_id) ??
              this.asString(item.variation_code) ??
              `vtu-${index + 1}`,
            name:
              this.asString(item.service_name) ??
              this.asString(item.name) ??
              this.asString(item.variation_name) ??
              `VTU ${index + 1}`,
            minAmount: item.min_amount ?? item.minAmount ?? null,
            maxAmount: item.max_amount ?? item.maxAmount ?? null,
            amount: item.variation_amount ?? item.amount ?? null,
            metadata: this.redactPayload(item),
          };
        }),
      };
    }

    return {
      categories: [
        {
          id: 'electricity',
          code: 'electricity',
          title: 'Electricity',
          providers: content.map((entry, index) => {
            const item = this.asRecord(entry) ?? {};
            return {
              id:
                this.asString(item.service_id) ??
                this.asString(item.variation_code) ??
                String(index + 1),
              code:
                this.asString(item.service_id) ??
                this.asString(item.variation_code) ??
                `electricity-${index + 1}`,
              name:
                this.asString(item.service_name) ??
                this.asString(item.name) ??
                this.asString(item.variation_name) ??
                `Electricity ${index + 1}`,
              metadata: this.redactPayload(item),
            };
          }),
        },
      ],
    };
  }

  private toVtuNgValidationPayload(payload: AnyRecord) {
    return {
      service_id:
        this.asString(payload.service_id) ??
        this.asString(payload.serviceId) ??
        this.asString(payload.providerCode),
      billersCode:
        this.asString(payload.billersCode) ??
        this.asString(payload.customerId) ??
        this.asString(payload.meterNumber),
      type: this.asString(payload.type) ?? this.asString(payload.meterType),
    };
  }

  private toVtuNgPurchasePayload(
    type: 'airtime' | 'data' | 'utilities',
    payload: AnyRecord,
    requestId: string,
  ) {
    if (type === 'airtime') {
      return {
        request_id: requestId,
        service_id:
          this.asString(payload.service_id) ??
          this.asString(payload.serviceId) ??
          this.asString(payload.network) ??
          this.asString(payload.operatorId),
        amount: this.normalizeAmount(payload.amount),
        phone:
          this.asString(payload.phone) ?? this.asString(payload.recipientPhone),
      };
    }
    if (type === 'data') {
      return {
        request_id: requestId,
        service_id:
          this.asString(payload.service_id) ??
          this.asString(payload.serviceId) ??
          this.asString(payload.network) ??
          this.asString(payload.operatorId),
        variation_code:
          this.asString(payload.variation_code) ??
          this.asString(payload.variationCode) ??
          this.asString(payload.planCode),
        phone:
          this.asString(payload.phone) ?? this.asString(payload.recipientPhone),
      };
    }
    return {
      request_id: requestId,
      service_id:
        this.asString(payload.service_id) ??
        this.asString(payload.serviceId) ??
        this.asString(payload.providerCode),
      variation_code:
        this.asString(payload.variation_code) ??
        this.asString(payload.variationCode),
      billersCode:
        this.asString(payload.billersCode) ??
        this.asString(payload.customerId) ??
        this.asString(payload.meterNumber),
      amount: this.normalizeAmount(payload.amount),
      phone:
        this.asString(payload.phone) ?? this.asString(payload.customerPhone),
    };
  }

  private async recordBlockedOperation(
    userId: string,
    type: string,
    payload: AnyRecord,
    block: {
      provider: string;
      capability: ProviderCapability;
      reason: string;
    },
  ): Promise<never> {
    const idempotencyKey =
      this.asString(payload.idempotencyKey) ??
      this.asString(payload.reference) ??
      `${type}_${randomUUID()}`;
    const status = this.providerStatusService.getStatus(block.capability);
    const blocked = createBlockedResponse({
      code: status.enabled
        ? 'PROVIDER_FLOW_NOT_LIVE_TESTED'
        : 'PROVIDER_UNAVAILABLE',
      feature: type,
      capability: block.capability,
      provider: block.provider,
      reason: block.reason,
      missingRequirements: status.missingEnvVars,
    });

    const existing = await this.providerOperationRepository.findOne({
      where: { userId, type, idempotencyKey },
    });

    if (!existing) {
      await this.providerOperationRepository.save(
        this.providerOperationRepository.create({
          userId,
          type,
          idempotencyKey,
          reference: idempotencyKey,
          status: 'BLOCKED',
          amount:
            payload.amount === undefined
              ? null
              : this.normalizeAmount(payload.amount),
          currency: this.asString(payload.currency),
          provider: block.provider,
          requestPayload: this.redactPayload(payload),
          errorCode: blocked.code,
          failureReason: blocked.message,
          metadata: { blocked },
        }),
      );
    }

    throw new ServiceUnavailableException(blocked);
  }

  private async assertCapabilityProductAccess(
    userId: string,
    capability: ProviderCapability,
  ) {
    const product = this.productForCapability(capability);
    if (product) {
      await this.assertProductAccess(userId, product);
      return;
    }
    await this.findUser(userId);
  }

  private async assertProductAccess(userId: string, product: ProductCode) {
    const user = await this.findUser(userId);
    const eligibility = this.productEligibilityService.evaluate(user, product);
    if (
      !eligibility.enabled &&
      eligibility.blockedResponse &&
      eligibility.status !== 'PROVIDER_NOT_CONFIGURED'
    ) {
      throw new ServiceUnavailableException(eligibility.blockedResponse);
    }
    return { user, eligibility };
  }

  private productForCapability(
    capability: ProviderCapability,
  ): ProductCode | null {
    if (capability.startsWith('crypto_')) return 'crypto';
    if (capability.startsWith('investments_')) return 'investments';
    if (capability.startsWith('usd_loan') || capability === 'usd_loans') {
      return 'lending';
    }
    if (capability === 'tax') return 'foreign_tax';
    return null;
  }

  private async persistKycStartState(userId: string, profile: KycProfile) {
    let kycStorageAvailable = Boolean(profile.id);
    if (profile.id) {
      try {
        await this.kycProfileRepository.save(profile);
      } catch (error) {
        if (!this.isKycProfileStorageUnavailable(error)) {
          throw error;
        }
        kycStorageAvailable = false;
      }
    }
    try {
      await this.userRepository.update(userId, { kycStatus: profile.status });
    } catch (error) {
      if (!this.isMissingColumn(error, 'kycStatus')) {
        throw error;
      }
    }
    return kycStorageAvailable;
  }

  private fincraKycEnabled(region?: string | null) {
    return (
      region === 'NG' &&
      ['true', '1', 'yes'].includes(
        (
          this.configService.get<string>('FINCRA_KYC_ENABLED') ?? ''
        ).toLowerCase(),
      ) &&
      Boolean(this.configService.get<string>('FINCRA_API_KEY')) &&
      Boolean(this.configService.get<string>('FINCRA_BUSINESS_ID'))
    );
  }

  private metamapConfigured() {
    return Boolean(
      (this.configService.get<string>('METAMAP_CLIENT_ID') ??
        this.configService.get<string>('METAMAP_MERCHANT_TOKEN')) &&
      (this.configService.get<string>('METAMAP_WORKFLOW_ID') ??
        this.configService.get<string>('METAMAP_FLOW_ID')),
    );
  }

  private fincraKycRequirements(region?: string | null) {
    if (region !== 'NG') {
      return [
        'legal_name',
        'date_of_birth',
        'address',
        'government_id',
        'proof_of_address',
      ];
    }
    return [
      'legal_name',
      'date_of_birth',
      'bvn',
      'address',
      'government_id',
      'liveness_or_manual_review',
    ];
  }

  private async verifyFincraIdentity(
    userId: string,
    user: User,
    payload: AnyRecord,
  ) {
    const bvn = this.asString(payload.bvn ?? payload.BVN);
    if (!bvn) {
      return {
        provider: 'FINCRA',
        status: 'REQUIRES_INFORMATION',
        missingRequirements: ['bvn'],
        message: 'BVN is required before Fincra identity verification can run.',
      };
    }
    const businessId = this.configService.get<string>('FINCRA_BUSINESS_ID');
    if (!businessId) {
      return {
        provider: 'FINCRA',
        status: 'PROVIDER_NOT_CONFIGURED',
        missingRequirements: ['FINCRA_BUSINESS_ID'],
      };
    }
    const reference = `fincra_kyc_${userId}_${createHash('sha256')
      .update(bvn)
      .digest('hex')
      .slice(0, 16)}`;
    const existing = await this.providerOperationRepository.findOne({
      where: { userId, type: 'kyc_fincra_bvn', idempotencyKey: reference },
    });
    if (existing) {
      return {
        provider: 'FINCRA',
        status: existing.status,
        providerReference: existing.providerReference ?? null,
        cached: true,
      };
    }
    const operation = await this.providerOperationRepository.save(
      this.providerOperationRepository.create({
        userId,
        type: 'kyc_fincra_bvn',
        idempotencyKey: reference,
        reference,
        status: 'PENDING',
        provider: 'Fincra',
        requestPayload: {
          business: businessId,
          bvnFingerprint: createHash('sha256').update(bvn).digest('hex'),
          user: {
            countryCode: user.countryCode ?? null,
            residency: user.residency ?? null,
          },
        },
        responsePayload: null,
        metadata: { source: 'FINCRA_BVN_VERIFICATION' },
      }),
    );
    try {
      const response = await this.sandboxProviderService.verifyFincraBvn({
        bvn,
        businessId,
      });
      operation.status = 'SUBMITTED';
      operation.providerReference =
        this.asString(response.reference) ??
        this.asString(response.id) ??
        this.asString(this.asRecord(response.data)?.id) ??
        null;
      operation.responsePayload = this.safeKycProviderResponse(response);
      await this.providerOperationRepository.save(operation);
      return {
        provider: 'FINCRA',
        status: 'SUBMITTED',
        providerReference: operation.providerReference,
        response: operation.responsePayload,
      };
    } catch (error) {
      operation.status = 'FAILED';
      operation.errorCode = 'FINCRA_KYC_REQUEST_FAILED';
      operation.failureReason = this.providerErrorMessage(error);
      await this.providerOperationRepository.save(operation);
      return {
        provider: 'FINCRA',
        status: 'FAILED',
        reason: operation.failureReason,
        fallbackProvider: this.metamapConfigured() ? 'METAMAP' : null,
      };
    }
  }

  private safeKycProviderResponse(response: AnyRecord) {
    const data = this.asRecord(response.data) ?? response;
    return {
      status:
        this.asString(data.status) ??
        this.asString(data.verificationStatus) ??
        this.asString(response.status) ??
        null,
      reference:
        this.asString(data.reference) ??
        this.asString(response.reference) ??
        null,
      id: this.asString(data.id) ?? this.asString(response.id) ?? null,
      message:
        this.asString(data.message) ?? this.asString(response.message) ?? null,
    };
  }

  private fxCurrencyPairs() {
    const pairs: Array<{ fromCurrency: string; toCurrency: string }> = [];
    fxCurrencies.forEach((fromCurrency) => {
      fxCurrencies.forEach((toCurrency) => {
        if (fromCurrency !== toCurrency)
          pairs.push({ fromCurrency, toCurrency });
      });
    });
    return pairs;
  }

  private normalizeFxCurrency(value: unknown) {
    const currency = this.asString(value)?.toUpperCase();
    if (
      !currency ||
      !fxCurrencies.includes(currency as (typeof fxCurrencies)[number])
    ) {
      throw new BadRequestException('currency must be NGN, USD, GBP, or CAD');
    }
    return currency;
  }

  private normalizeFincraRates(
    raw: AnyRecord,
    pairs: Array<{ fromCurrency: string; toCurrency: string }>,
  ) {
    const candidates = this.collectRateRecords(raw);
    return pairs
      .map((pair) => {
        const match = candidates.find((item) => {
          const record = this.asRecord(item);
          if (!record) return false;
          const from = this.asString(
            record.fromCurrency ??
              record.sourceCurrency ??
              record.baseCurrency ??
              record.currency,
          )?.toUpperCase();
          const to = this.asString(
            record.toCurrency ??
              record.destinationCurrency ??
              record.quoteCurrency ??
              record.counterCurrency,
          )?.toUpperCase();
          return from === pair.fromCurrency && to === pair.toCurrency;
        });
        const record = this.asRecord(match);
        const rate = record
          ? Number(
              record.rate ?? record.buyRate ?? record.sellRate ?? record.value,
            )
          : NaN;
        if (!Number.isFinite(rate) || rate <= 0) return null;
        return {
          fromCurrency: pair.fromCurrency,
          toCurrency: pair.toCurrency,
          rate,
          side: this.asString(record?.side) ?? null,
          rawProviderStatus: this.asString(record?.status) ?? null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }

  private collectRateRecords(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    const record = this.asRecord(value);
    if (!record) return [];
    const directKeys = ['data', 'rates', 'items', 'content', 'result'];
    for (const key of directKeys) {
      const nested = record[key];
      if (Array.isArray(nested)) return nested;
      const nestedRecord = this.asRecord(nested);
      if (nestedRecord) {
        const nestedItems = this.collectRateRecords(nestedRecord);
        if (nestedItems.length) return nestedItems;
      }
    }
    return [record];
  }

  private findFxRate(
    ratesResponse: AnyRecord,
    fromCurrency: string,
    toCurrency: string,
  ) {
    const rates = Array.isArray(ratesResponse.rates)
      ? (ratesResponse.rates as AnyRecord[])
      : [];
    return rates.find(
      (rate) =>
        rate.fromCurrency === fromCurrency && rate.toCurrency === toCurrency,
    ) as AnyRecord | undefined;
  }

  private throwProviderUnavailable(input: {
    code?: string;
    feature: string;
    capability: ProviderCapability | 'kyc_start';
    provider: string | null;
    reason: string;
    missingRequirements?: string[];
  }): never {
    throw new ServiceUnavailableException(
      createBlockedResponse({
        code: input.code ?? 'PROVIDER_UNAVAILABLE',
        feature: input.feature,
        capability: input.capability,
        provider: input.provider,
        reason: input.reason,
        missingRequirements: input.missingRequirements ?? [],
      }),
    );
  }

  private providerReadinessForCurrency(currency: string) {
    if (currency === Currency.NGN) {
      const status = this.providerStatusService.getStatus(
        'ngn_account_details',
      );
      return status.enabled ? status.readinessStatus : 'MISSING_CREDENTIALS';
    }
    if (currency === Currency.USD) {
      const status = this.providerStatusService.getStatus(
        'usd_account_details',
      );
      return status.enabled ? status.readinessStatus : 'MISSING_CREDENTIALS';
    }
    const status = this.providerStatusService.getStatus('wallet_activation');
    return status.enabled ? status.readinessStatus : 'MISSING_CREDENTIALS';
  }

  private normalizeCurrency(value: unknown): Currency {
    const currency = this.asString(value)?.toUpperCase();
    if (Object.values(Currency).includes(currency as Currency)) {
      return currency as Currency;
    }
    throw new BadRequestException('currency must be NGN, USD, GBP, or CAD');
  }

  private normalizeAmount(value: unknown): number {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('amount must be greater than zero');
    }
    return this.roundMoney(amount);
  }

  private roundMoney(amount: number) {
    return Math.round(amount * 100) / 100;
  }

  private asString(value: unknown) {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : null;
  }

  private asRecord(value: unknown): AnyRecord | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as AnyRecord)
      : null;
  }

  private normalizeStringList(values?: unknown[] | null): string[] {
    if (!Array.isArray(values)) {
      return [];
    }
    return [
      ...new Set(
        values
          .map((value) => this.asString(value))
          .filter((value): value is string => Boolean(value))
          .map((value) =>
            value
              .trim()
              .replace(/[\s-]+/g, '_')
              .replace(/[^a-zA-Z0-9_]/g, '')
              .toLowerCase(),
          )
          .filter(Boolean),
      ),
    ];
  }

  private mergeKycIdentityAction(
    identity: Record<string, unknown> | null,
    action: {
      actionRequired: boolean;
      missingRequirements: string[];
      message: string | null;
      reviewedBy: string;
      reviewedAt: string;
      status: string;
    },
  ) {
    const existing = this.asRecord(identity) ?? {};
    return {
      ...existing,
      missingRequirements: action.missingRequirements,
      actionRequired: {
        required: action.actionRequired,
        missingRequirements: action.missingRequirements,
        message: action.message,
        reviewedBy: action.reviewedBy,
        reviewedAt: action.reviewedAt,
        status: action.status,
      },
    };
  }

  private markMissingKycSections(
    sections: AnyRecord[] | null,
    region: string | null,
    missingRequirements: string[],
    status: string,
  ) {
    const current = sections?.length
      ? sections
      : this.defaultKycSections(region, 'NOT_STARTED');
    if (status !== 'RETRY_REQUIRED' || missingRequirements.length === 0) {
      return current;
    }

    return current.map((section) => {
      const sectionKey = this.asString(section.section)?.toLowerCase();
      const requested = missingRequirements.some((requirement) => {
        if (!sectionKey) return false;
        if (requirement.includes(sectionKey)) return true;
        return (
          (sectionKey === 'government_id' &&
            ['government_id', 'identity', 'id', 'nin', 'bvn', 'ssn'].some(
              (key) => requirement.includes(key),
            )) ||
          (sectionKey === 'address' && requirement.includes('address')) ||
          (sectionKey === 'liveness' && requirement.includes('liveness'))
        );
      });

      return requested
        ? {
            ...section,
            status: 'ACTION_REQUIRED',
            completed: false,
            missingRequirements,
          }
        : section;
    });
  }

  private redactPayload(payload: AnyRecord) {
    const redacted = { ...payload };
    ['pin', 'password', 'cvv', 'pan', 'cardNumber', 'secret', 'token'].forEach(
      (field) => {
        if (Object.prototype.hasOwnProperty.call(redacted, field)) {
          redacted[field] = '[REDACTED]';
        }
      },
    );
    return redacted;
  }

  private inferRegion(user: User): string | null {
    const explicit = [
      user.region,
      user.countryCode,
      user.country,
      user.residency,
    ]
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase());

    if (
      explicit.some((value) =>
        ['ng', 'nigeria', '+234', '234'].includes(value),
      ) ||
      user.phoneNumber?.startsWith('+234')
    ) {
      return 'NG';
    }
    if (
      explicit.some((value) =>
        ['us', 'usa', 'united states', 'united_states', '+1', '1'].includes(
          value,
        ),
      ) ||
      user.phoneNumber?.startsWith('+1')
    ) {
      return 'US';
    }
    return null;
  }

  private defaultKycSections(region: string | null, status = 'NOT_STARTED') {
    const completed = ['SUBMITTED', 'UNDER_REVIEW', 'VERIFIED'].includes(
      status,
    );
    return [
      {
        section: 'GOVERNMENT_ID',
        title: 'Government Issued ID',
        description:
          region === 'NG'
            ? 'Provide your NIN and BVN, then capture your government ID.'
            : region === 'US'
              ? 'Provide your SSN or equivalent identity number and capture your ID.'
              : 'KYC is currently supported for Nigeria and United States accounts.',
        status,
        completed,
      },
      {
        section: 'ADDRESS',
        title: 'Verify Address',
        description:
          'Confirm your current address and upload proof of address.',
        status,
        completed,
      },
      {
        section: 'LIVENESS',
        title: 'Liveness Check',
        description: 'Take a live selfie for identity verification.',
        status,
        completed,
      },
    ];
  }

  private updateKycSection(
    sections: AnyRecord[] | null,
    target: string,
    status: string,
  ) {
    const nextSections = sections?.length
      ? sections
      : this.defaultKycSections(null, 'NOT_STARTED');
    return nextSections.map((section) =>
      section.section === target
        ? { ...section, status, completed: true }
        : section,
    );
  }

  private computeKycStatus(sections: AnyRecord[] | null) {
    const values = sections ?? [];
    if (
      values.length > 0 &&
      values.every((section) =>
        ['SUBMITTED', 'UNDER_REVIEW', 'VERIFIED'].includes(
          String(section.status),
        ),
      )
    ) {
      return 'UNDER_REVIEW';
    }
    return 'IN_PROGRESS';
  }

  private mapProviderKycStatus(status?: string | null) {
    const normalized = status?.toUpperCase().replace(/[\s-]+/g, '_');
    if (!normalized) {
      return 'UNDER_REVIEW';
    }
    if (['APPROVED', 'VERIFIED'].includes(normalized)) {
      return 'VERIFIED';
    }
    if (['REJECTED', 'DECLINED'].includes(normalized)) {
      return 'REJECTED';
    }
    if (['FAILED', 'EXPIRED'].includes(normalized)) {
      return normalized;
    }
    return 'UNDER_REVIEW';
  }

  private assertKycWebhookSignature(payload: AnyRecord, signature?: string) {
    const secret = this.configService.get<string>('METAMAP_WEBHOOK_SECRET');
    const environment =
      this.configService.get<string>('NODE_ENV') ?? 'development';

    if (!secret) {
      if (environment === 'production') {
        this.throwProviderUnavailable({
          code: 'KYC_WEBHOOK_NOT_CONFIGURED',
          feature: 'kyc_webhook',
          capability: 'kyc_start',
          provider: 'MetaMap',
          reason: 'The MetaMap webhook secret is not configured.',
          missingRequirements: ['METAMAP_WEBHOOK_SECRET'],
        });
      }
      return;
    }

    if (!signature) {
      throw new UnauthorizedException('KYC webhook signature is required');
    }

    const expected = createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
    const provided = signature.replace(/^sha256=/i, '').trim();
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const providedBuffer = Buffer.from(provided, 'utf8');

    if (
      expectedBuffer.length !== providedBuffer.length ||
      !timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      throw new UnauthorizedException('Invalid KYC webhook signature');
    }
  }

  private assertProviderWebhookSignature(
    provider: string,
    payload: AnyRecord,
    signature?: string,
  ) {
    const secretKey =
      provider === 'Unit.co'
        ? 'UNIT_WEBHOOK_SECRET'
        : 'PAYVESSEL_WEBHOOK_SECRET';
    const secret = this.configService.get<string>(secretKey);
    const environment =
      this.configService.get<string>('NODE_ENV') ?? 'development';

    if (!secret) {
      if (environment === 'production') {
        this.throwProviderUnavailable({
          code: 'PROVIDER_WEBHOOK_NOT_CONFIGURED',
          feature: `${provider} webhook`,
          capability: provider === 'Unit.co' ? 'usd_wallet' : 'ngn_wallet',
          provider,
          reason: `${provider} webhook signing secret is not configured.`,
          missingRequirements: [secretKey],
        });
      }
      return;
    }

    if (!signature) {
      throw new UnauthorizedException(
        `${provider} webhook signature is required`,
      );
    }

    const expected = createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
    const provided = signature.replace(/^sha256=/i, '').trim();
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const providedBuffer = Buffer.from(provided, 'utf8');

    if (
      expectedBuffer.length !== providedBuffer.length ||
      !timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      throw new UnauthorizedException(`Invalid ${provider} webhook signature`);
    }
  }

  private assertFincraWebhookSignature(payload: AnyRecord, signature?: string) {
    const secret = this.configService.get<string>('FINCRA_WEBHOOK_SECRET');
    if (!secret) {
      this.throwProviderUnavailable({
        code: 'PROVIDER_WEBHOOK_NOT_CONFIGURED',
        feature: 'FINCRA webhook',
        capability: 'wallet_activation',
        provider: 'FINCRA',
        reason: 'FINCRA webhook signing secret is not configured.',
        missingRequirements: ['FINCRA_WEBHOOK_SECRET'],
      });
    }
    if (!signature) {
      throw new UnauthorizedException('FINCRA webhook signature is required');
    }
    const expected = createHmac('sha512', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
    const provided = signature.trim();
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const providedBuffer = Buffer.from(provided, 'utf8');
    if (
      expectedBuffer.length !== providedBuffer.length ||
      !timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      throw new UnauthorizedException('Invalid FINCRA webhook signature');
    }
  }

  private assertGenericWebhookSignature(input: {
    provider: string;
    capability: ProviderCapability;
    secretKey: string;
    payload: AnyRecord;
    signature?: string;
    signaturePrefix?: string;
    requiredInProduction?: boolean;
  }) {
    const secret = this.configService.get<string>(input.secretKey);
    const environment =
      this.configService.get<string>('NODE_ENV') ?? 'development';
    if (!secret) {
      if (environment === 'production' || input.requiredInProduction) {
        this.throwProviderUnavailable({
          code: 'PROVIDER_WEBHOOK_NOT_CONFIGURED',
          feature: `${input.provider} webhook`,
          capability: input.capability,
          provider: input.provider,
          reason: `${input.provider} webhook signing secret is not configured.`,
          missingRequirements: [input.secretKey],
        });
      }
      return;
    }
    if (!input.signature) {
      throw new UnauthorizedException(
        `${input.provider} webhook signature is required`,
      );
    }
    const expected = createHmac('sha256', secret)
      .update(JSON.stringify(input.payload))
      .digest('hex');
    const provided = input.signature
      .replace(new RegExp(`^${input.signaturePrefix ?? ''}`, 'i'), '')
      .trim();
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const providedBuffer = Buffer.from(provided, 'utf8');
    if (
      expectedBuffer.length !== providedBuffer.length ||
      !timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      throw new UnauthorizedException(
        `Invalid ${input.provider} webhook signature`,
      );
    }
  }

  private capabilitiesForKycStatus(status: string) {
    const verified = status === 'VERIFIED';
    return {
      canReceive: true,
      canTransfer: verified,
      canTagTransfer: true,
      canBankTransfer: verified,
      blockedReason: verified
        ? null
        : 'Complete KYC to unlock bank transfers and higher limits.',
      tagTransferBlockedReason: null,
      bankTransferBlockedReason: verified
        ? null
        : 'Complete KYC to unlock bank transfers and higher limits.',
    };
  }

  private defaultLimits(status = 'NOT_STARTED') {
    const verified = status === 'VERIFIED';
    const progressLevel = verified
      ? 4
      : ['SUBMITTED', 'UNDER_REVIEW', 'MANUAL_REVIEW'].includes(status)
        ? 3
        : ['IN_PROGRESS', 'RETRY_REQUIRED'].includes(status)
          ? 2
          : 1;
    return {
      version: '2026-09-14',
      source: 'BACKEND_POLICY',
      currency: 'MIXED',
      accountProgressLevel: progressLevel,
      regulatoryReference: {
        jurisdiction: 'NG',
        framework: 'CBN_MOBILE_MONEY_THREE_TIER_KYC',
        note: 'VidalPay account progress levels are not CBN KYC tiers. Effective limits require verified BVN or NIN, provider provisioning, and compliance approval.',
        tiers: [
          { tier: 1, dailyOutflow: 50000, balance: 300000 },
          { tier: 2, dailyOutflow: 200000, balance: 500000 },
          { tier: 3, dailyOutflow: 5000000, balance: null },
        ],
      },
      enforcement: {
        kycGatesEnforced: true,
        amountLimitsEnforced: false,
        reason:
          'Daily and monthly amount limits are not configured for production enforcement yet. Provider-specific limits are returned only after provider provisioning.',
      },
      outbound: {
        tagTransfer: {
          enabled: true,
          perTransaction: null,
          daily: null,
          monthly: null,
          enforced: false,
        },
        bankTransfer: {
          enabled: verified,
          perTransaction: null,
          daily: null,
          monthly: null,
          enforced: false,
          blockedReason: verified
            ? null
            : 'Complete KYC before external bank transfers are enabled.',
        },
      },
      inbound: {
        internal: {
          enabled: true,
          daily: null,
          monthly: null,
          enforced: false,
        },
        bankTransfer: {
          enabled: verified,
          daily: null,
          monthly: null,
          enforced: false,
          blockedReason: verified
            ? null
            : 'Complete KYC before provider bank-transfer rails are enabled.',
        },
      },
      card: {
        enabled: verified,
        providerLimits: null,
        blockedReason: verified
          ? null
          : 'Complete KYC before provider-backed cards are enabled.',
      },
      bills: {
        enabled: verified,
        providerLimits: null,
        blockedReason: verified
          ? null
          : 'Complete KYC before provider-backed bill payments are enabled.',
      },
      lastEvaluatedAt: null,
      trustSignals: {
        transactionVolume: null,
        transactionConsistency: null,
        activeDurationDays: null,
      },
    };
  }

  private buildSecurityOverview(user: User) {
    return {
      email: user.email,
      phoneNumber: user.phoneNumber ?? null,
      emailVerified: user.isVerified,
      phoneVerified: user.isPhoneVerified,
      authType: user.authType,
      lastLogin: user.lastLogin ?? null,
      hasTransactionPin: Boolean(user.pin),
      requiresTransactionPinSetup: !user.pin,
      biometricManagedByDevice: true,
      availableActions: {
        createTransactionPin: !user.pin,
        resetTransactionPin: Boolean(user.pin),
        changeEmail: true,
        changePhone: true,
      },
    };
  }

  private defaultCurrencyForRegion(region?: string | null) {
    return region === 'US'
      ? Currency.USD
      : region === 'NG'
        ? Currency.NGN
        : null;
  }

  private orderWalletsByDefault(
    wallets: Wallet[],
    defaultCurrency?: Currency | null,
  ) {
    if (!defaultCurrency) {
      return wallets;
    }
    return [...wallets].sort((left, right) => {
      if (left.currency === defaultCurrency) return -1;
      if (right.currency === defaultCurrency) return 1;
      return 0;
    });
  }

  private buildProductAvailability(region?: string | null) {
    const nigeriaAccount = region === 'NG';
    return {
      wallet: true,
      transfer: true,
      deposit: false,
      cardTopUp: false,
      conversion: false,
      airtime:
        nigeriaAccount &&
        this.providerStatusService.isCapabilityEnabled('airtime_purchase'),
      data:
        nigeriaAccount &&
        this.providerStatusService.isCapabilityEnabled('data_purchase'),
      utilities:
        nigeriaAccount &&
        this.providerStatusService.isCapabilityEnabled('utilities_payment'),
      loan: false,
      taxFiling: false,
      crypto: false,
    };
  }

  private buildAccountRails(
    wallets: Wallet[],
    defaultCurrency?: Currency | null,
  ) {
    const rails = wallets.map((wallet) => ({
      walletId: wallet.id,
      currency: wallet.currency,
      provider: wallet.provider ?? null,
      region: wallet.currency === Currency.NGN ? 'NG' : 'US',
      railType:
        wallet.accountNumber && wallet.currency === Currency.NGN
          ? 'VIRTUAL_ACCOUNT'
          : wallet.accountNumber && wallet.currency === Currency.USD
            ? 'ACH'
            : 'INTERNAL_ONLY',
      balance: Number(wallet.balance ?? 0),
      accountNumber: wallet.accountNumber ?? null,
      routingNumber: wallet.routingNumber ?? null,
      accountName: wallet.accountName ?? null,
      bankName: wallet.bankName ?? null,
      sortCode: wallet.sortCode ?? null,
      receiveEnabled: true,
      transferEnabled: true,
      externalReceiveEnabled: Boolean(wallet.accountNumber),
      externalTransferEnabled: false,
      providerCustomerId: wallet.providerCustomerId ?? null,
      providerAccountId: wallet.providerAccountId ?? null,
      providerVirtualAccountId: wallet.providerVirtualAccountId ?? null,
      providerReference: wallet.providerReference ?? null,
      providerMetadata: wallet.metadata ?? null,
    }));

    return {
      primary:
        rails.find((rail) => rail.currency === defaultCurrency) ??
        rails[0] ??
        null,
      byCurrency: rails.reduce((acc, rail) => {
        acc[rail.currency] = rail;
        return acc;
      }, {}),
    };
  }

  private buildFundingMethods() {
    return [
      {
        code: 'BANK_TRANSFER',
        title: 'Bank transfer',
        description: 'Receive funds into provider-provisioned account details.',
        enabled: false,
        provider: 'Unit.co/PayVessel',
        blockedReason: 'Provider account details have not been provisioned.',
        currencies: ['USD', 'NGN'],
        action: { type: 'INFO', path: null, method: null },
      },
      {
        code: 'CARD_TOP_UP',
        title: 'Card top-up',
        description: 'Fund your wallet by card after payment processor setup.',
        enabled: false,
        provider: null,
        blockedReason: 'Card top-up provider is not configured.',
        currencies: ['USD', 'NGN'],
        action: { type: 'POST', path: '/wallet/top-up/card', method: 'POST' },
      },
    ];
  }

  private buildPendingActions(user: User, kyc: KycProfile) {
    const actions: Array<{
      id: string;
      title: string;
      description: string;
      actionText: string;
      route: string;
      priority: number;
    }> = [];
    if (!user.pin) {
      actions.push({
        id: 'transaction_pin',
        title: 'Set transaction PIN',
        description: 'Set a transaction PIN before moving money.',
        actionText: 'Set PIN',
        route: 'ChangeTransactionPin',
        priority: 1,
      });
    }
    if (kyc.status !== 'VERIFIED') {
      actions.push({
        id: 'kyc',
        title: 'Complete KYC',
        description: 'Complete identity verification to unlock bank transfers.',
        actionText: 'Continue',
        route: 'KYCStart',
        priority: 2,
      });
    }
    return actions;
  }

  private defaultNotificationPreferences() {
    return {
      push: true,
      email: true,
      sms: false,
      transactions: true,
      security: true,
      marketing: false,
    };
  }

  private faqs() {
    return [
      {
        id: 'wallet-funding',
        category: 'Wallet',
        question: 'Why are my account details unavailable?',
        answer:
          'Account details appear after the backend provisions real provider accounts with Unit.co or PayVessel.',
      },
      {
        id: 'provider-status',
        category: 'Providers',
        question: 'Why is a feature blocked?',
        answer:
          'VidalPay blocks provider-only features until the matching sandbox credentials and webhook flow are configured.',
      },
    ];
  }

  private legalDocuments() {
    return [
      {
        slug: 'terms',
        title: 'Terms of Service',
        version: 'draft',
        summary: 'Operational terms placeholder pending legal review.',
        content: [
          'These draft terms are provided by the backend so the mobile app can render a document endpoint.',
          'Final production terms must be reviewed and approved by VidalPay legal counsel.',
        ],
      },
      {
        slug: 'privacy',
        title: 'Privacy Policy',
        version: 'draft',
        summary: 'Privacy policy placeholder pending legal review.',
        content: [
          'This draft privacy policy endpoint is not a substitute for counsel-approved production policy text.',
          'Provider payloads, PAN, CVV, passwords, and transaction PINs must not be exposed to mobile logs.',
        ],
      },
    ];
  }
}
