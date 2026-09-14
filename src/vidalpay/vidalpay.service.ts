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
import {
  BlockedResponse,
  createBlockedResponse,
  ProviderCapability,
} from './contracts';
import { ProviderStatusService } from './provider-status.service';

type AnyRecord = Record<string, unknown>;

const supportedCurrencies = [Currency.NGN, Currency.USD] as const;

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
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly dataSource: DataSource,
  ) {}

  async getProviderStatuses() {
    return {
      providers: this.providerStatusService.getStatuses(),
    };
  }

  async getCurrentUser(userId: string) {
    const user = await this.findUser(userId);
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
    await this.findUser(userId);
    return {
      promotions: [],
      pendingActions: [],
    };
  }

  async getSecurityOverview(userId: string) {
    const user = await this.findUser(userId);
    return this.buildSecurityOverview(user);
  }

  async getAccountLevel(userId: string) {
    const user = await this.findUser(userId);
    const kyc = await this.getKycProfileForSession(user);
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

  async getWalletByCurrency(userId: string, currency: Currency) {
    await this.findUser(userId);
    const wallet = await this.ensureWallet(userId, currency);
    return this.normalizeWallet(wallet);
  }

  async getWalletAccountDetails(userId: string, currency: Currency) {
    const wallet = await this.ensureWallet(userId, currency);
    const normalized = this.normalizeWallet(wallet);

    if (!wallet.accountNumber) {
      return {
        accountDetails: {
          accountName: normalized.accountName,
          accountNumber: normalized.accountNumber,
          bankName: normalized.bankName,
          currency,
          provider: normalized.provider,
          providerStatus:
            normalized.providerStatus ??
            this.providerReadinessForCurrency(currency),
          isProvisioned: false,
          message:
            currency === Currency.NGN
              ? 'NGN account details require PayVessel virtual-account provisioning.'
              : 'USD account details require Unit deposit-account provisioning.',
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
        currency,
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
      currency === Currency.USD ? 'usd_account_details' : 'bank_transfer';
    this.throwProviderUnavailable({
      feature: 'External transfer resolution',
      capability,
      provider: currency === Currency.USD ? 'Unit.co' : 'PayVessel',
      reason:
        'External account resolution requires a live provider integration and credentials.',
      missingRequirements:
        this.providerStatusService.getStatus(capability).missingEnvVars,
    });
  }

  async externalTransfer(userId: string, payload: AnyRecord) {
    const currency = this.normalizeCurrency(payload.currency);
    await this.recordBlockedOperation(userId, 'external_transfer', payload, {
      provider: currency === Currency.USD ? 'Unit.co' : 'PayVessel',
      capability: 'bank_transfer',
      reason:
        'External transfers must be executed by Unit.co or PayVessel; no live-tested provider path is configured.',
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
    const status = this.providerStatusService.getStatus(capabilityByKind[kind]);
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
    await this.recordBlockedOperation(userId, type, payload, {
      provider: 'PayVessel',
      capability: capabilityByKind[type],
      reason:
        'NGN wallet is not debited until PayVessel confirms the bill-payment operation.',
    });
  }

  async getFxQuote(userId: string, payload: AnyRecord) {
    await this.findUser(userId);
    this.throwProviderUnavailable({
      feature: 'FX quote',
      capability: 'fx_quote',
      provider: 'FX provider',
      reason:
        'The backend has no configured FX quote provider, so it cannot compute a final executable rate.',
      missingRequirements:
        this.providerStatusService.getStatus('fx_quote').missingEnvVars,
    });
  }

  async convertFx(userId: string, payload: AnyRecord) {
    await this.recordBlockedOperation(userId, 'fx_convert', payload, {
      provider: 'FX provider',
      capability: 'fx_convert',
      reason:
        'Currency conversion requires a provider quote and backend recomputation of final amounts.',
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

    const existing = await this.providerOperationRepository.findOne({
      where: { userId, type: 'internal_transfer', idempotencyKey },
    });
    if (existing) {
      return this.normalizeOperation(existing);
    }

    await this.assertTransactionPin(userId, pin);

    return this.dataSource.transaction(async (manager) => {
      const users = manager.getRepository(User);
      const wallets = manager.getRepository(Wallet);
      const operations = manager.getRepository(ProviderOperation);
      const transactions = manager.getRepository(FinancialTransaction);

      const recipient = await users.findOne({ where: { tagId: recipientTag } });
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
    const user = await this.userRepository.findOne({ where: { tagId } });
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

  async getTransactions(userId: string, currency?: Currency) {
    const where = currency ? { userId, currency } : { userId };
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
    decision: 'VERIFIED' | 'REJECTED' | 'IN_PROGRESS',
    reason?: string,
  ) {
    await this.findUser(adminUserId);
    const user = await this.findUser(userId);
    const profile = await this.getOrCreateKycProfile(user);
    const normalizedReason = this.asString(reason);

    profile.status = decision;
    profile.statusMessage = normalizedReason;
    profile.rejectionReason = decision === 'REJECTED' ? normalizedReason : null;
    profile.capabilities = this.capabilitiesForKycStatus(decision);
    profile.limits = this.defaultLimits(decision);
    await this.kycProfileRepository.save(profile);
    user.kycStatus = decision;
    await this.userRepository.update(userId, { kycStatus: decision });

    const auditReference = `kyc_review_${randomUUID()}`;
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
          reviewedBy: adminUserId,
        },
        metadata: { audit: true, adminUserId, decision },
      }),
    );

    const notification = await this.sendNotificationToUser(userId, {
      title:
        decision === 'VERIFIED'
          ? 'Account verification approved'
          : decision === 'REJECTED'
            ? 'More KYC information is required'
            : 'KYC review update',
      body:
        normalizedReason ??
        (decision === 'VERIFIED'
          ? 'Your account verification was approved.'
          : 'Please review your KYC checklist and submit the remaining information.'),
      category: 'KYC',
      metadata: { status: decision, reviewedBy: adminUserId },
    });

    return {
      user: this.normalizeAdminUser(user),
      kyc: this.normalizeKycProfile(profile),
      notification: notification.push,
    };
  }

  async startKyc(userId: string) {
    const user = await this.findUser(userId);
    const profile = await this.getOrCreateKycProfile(user);
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
        provider: 'MetaMap',
        reason: 'MetaMap client and workflow credentials are not configured.',
        missingRequirements: [
          'METAMAP_CLIENT_ID',
          'METAMAP_WORKFLOW_ID',
        ].filter((key) => !this.configService.get<string>(key)),
      });
    }

    profile.region = region;
    profile.provider = 'METAMAP';
    profile.status =
      profile.status === 'NOT_STARTED' ? 'IN_PROGRESS' : profile.status;
    await this.kycProfileRepository.save(profile);

    return {
      clientId,
      workflowId,
      metadata: {
        userId,
        profileId: profile.id,
        region,
        provider: 'METAMAP',
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

    const existingOperation = await this.providerOperationRepository.findOne({
      where: { type: 'kyc_webhook', idempotencyKey },
    });
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
    const profile = await this.getOrCreateKycProfile(user);
    profile.status = status;
    profile.statusMessage = this.asString(payload.message) ?? null;
    profile.rejectionReason = this.asString(payload.rejectionReason) ?? null;
    profile.capabilities = this.capabilitiesForKycStatus(status);
    profile.limits = this.defaultLimits(status);
    profile.providerReference =
      this.asString(payload.verificationId) ??
      this.asString(payload.id) ??
      null;
    await this.kycProfileRepository.save(profile);
    await this.userRepository.update(userId, {
      kycStatus: status,
    });

    const reference = `kyc_webhook_${createHash('sha256')
      .update(idempotencyKey)
      .digest('hex')}`;
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

    const notification = await this.sendNotificationToUser(userId, {
      title: 'KYC status updated',
      body:
        status === 'VERIFIED'
          ? 'Your identity verification was approved.'
          : status === 'REJECTED' || status === 'FAILED'
            ? 'Your identity verification needs attention. Review the details and submit the missing information.'
            : 'Your identity verification is being reviewed.',
      category: 'KYC',
      metadata: { kycStatus: status },
    });

    return {
      received: true,
      updated: true,
      status,
      notification: notification.push,
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

    await this.recordBlockedOperation(userId, `${type}_card_create`, payload, {
      provider: currency === Currency.USD ? 'Unit.co' : 'PayVessel',
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
    const ticket = await this.supportTicketRepository.save(
      this.supportTicketRepository.create({
        userId,
        category: this.asString(payload.category) ?? 'General',
        subject: this.asString(payload.subject) ?? 'Support request',
        message: this.asString(payload.message) ?? '',
        priority: this.asString(payload.priority) ?? 'NORMAL',
        preferredChannel: this.asString(payload.preferredChannel) ?? null,
        metadata: this.asRecord(payload.metadata),
      }),
    );
    return { ticket };
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
    await this.findUser(userId);
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
    await this.findUser(userId);
    return { assets: [] };
  }

  async investmentsOverview(userId: string) {
    await this.findUser(userId);
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
    await this.findUser(userId);
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
    await this.findUser(userId);
    return { products: [], items: [] };
  }

  async blockInvestmentOperation(
    userId: string,
    payload: AnyRecord,
    type: string,
  ) {
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
    await this.findUser(userId);
    return {
      enabled: false,
      status: 'UNAVAILABLE',
      provider: null,
      message:
        'Tax filing is unavailable until a backend tax provider is configured.',
    };
  }

  async taxOverview(userId: string) {
    await this.findUser(userId);
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
    await this.recordBlockedOperation(userId, type, payload, {
      provider: 'Tax provider',
      capability: 'tax',
      reason: 'Tax filing submission requires a configured tax provider.',
    });
  }

  async blockLoanOperation(userId: string, payload: AnyRecord, type: string) {
    await this.recordBlockedOperation(userId, type, payload, {
      provider: 'Unit.co',
      capability: 'usd_loan_application',
      reason:
        'Loan offers, approval, disbursement, and repayment require a live Unit credit program integration.',
    });
  }

  async loanOverview(userId: string) {
    await this.findUser(userId);
    return {
      enabled: false,
      provider: 'Unit.co',
      message:
        'USD loans are unavailable until Unit credit support is configured and live-tested.',
      loans: [],
    };
  }

  async loanUnavailable(userId: string, capability: ProviderCapability) {
    await this.findUser(userId);
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
      if (!this.isMissingTable(error, 'kyc_profile')) {
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
      new RegExp(`relation ["']?${tableName}["']? does not exist`, 'i').test(
        message,
      )
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
    return {
      id: profile.id,
      region: profile.region,
      provider: profile.provider,
      isSupportedRegion: profile.region === 'NG' || profile.region === 'US',
      status: profile.status,
      statusMessage: profile.statusMessage,
      rejectionReason: profile.rejectionReason,
      sections:
        profile.sections ??
        this.defaultKycSections(profile.region, profile.status),
      uploads: profile.uploads ?? [],
      capabilities:
        profile.capabilities ?? this.capabilitiesForKycStatus(profile.status),
      limits: profile.limits ?? this.defaultLimits(profile.status),
      identity: profile.identity ?? {},
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
        : kycStatus === 'IN_PROGRESS'
          ? 2
          : 1;
    const codeByRank: Record<number, string> = {
      1: 'ACCOUNT_CREATED',
      2: 'KYC_STARTED',
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
      capabilities: this.capabilitiesForKycStatus(kycStatus),
      limits: kyc.limits ?? this.defaultLimits(kycStatus),
      message: verified
        ? 'KYC is verified. Provider-specific limits still depend on live provider provisioning.'
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
    const capability =
      currency === Currency.USD ? 'usd_account_details' : 'ngn_account_details';
    const status = this.providerStatusService.getStatus(capability);
    return status.enabled ? status.readinessStatus : 'MISSING_CREDENTIALS';
  }

  private normalizeCurrency(value: unknown): Currency {
    const currency = this.asString(value)?.toUpperCase();
    if (currency === Currency.NGN || currency === Currency.USD) {
      return currency;
    }
    throw new BadRequestException('currency must be NGN or USD');
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
        : status === 'IN_PROGRESS'
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
