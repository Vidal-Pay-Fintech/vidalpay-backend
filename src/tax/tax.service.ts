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
import { TaxFiling } from 'src/database/entities/tax-filing.entity';
import { AccountStatus } from 'src/database/entities/user.entity';
import { TaxRepository } from 'src/database/repositories/tax.repository';
import { UserRepository } from 'src/database/repositories/user.repository';
import {
  ProviderConnectionStatus,
  ProviderReadinessStatus,
} from 'src/providers/provider-status.enum';
import { ProviderStatusService } from 'src/providers/provider-status.service';
import {
  TaxAccountStatus,
  TaxDocumentStatus,
  TaxEventSource,
  TaxFilingStatus,
} from './tax.enums';
import { TaxProviderGateway } from './tax-provider.gateway';
import {
  CreateTaxFilingDto,
  RegisterTaxDocumentDto,
  TaxIdempotentDto,
} from './dto/tax-request.dto';

const TERMINAL_STATUSES = new Set<TaxFilingStatus>([
  TaxFilingStatus.ACCEPTED,
  TaxFilingStatus.CLOSED,
]);

@Injectable()
export class TaxService {
  constructor(
    private readonly taxRepository: TaxRepository,
    private readonly userRepository: UserRepository,
    private readonly providerStatusService: ProviderStatusService,
    private readonly providerGateway: TaxProviderGateway,
  ) {}

  async getOverview(userId: string) {
    const [account, filings] = await Promise.all([
      this.taxRepository.findAccount(userId),
      this.taxRepository.findFilings(userId),
    ]);
    return {
      enabled: this.isProviderReady(),
      provider: this.getProviderStatus(),
      account,
      filings,
    };
  }

  getAccount(userId: string) {
    return this.taxRepository.findAccount(userId);
  }

  async openAccount(userId: string) {
    const user = await this.userRepository.getUserById(userId);
    this.assertEligibleUser(user);
    const existing = await this.taxRepository.findAccount(userId);
    const account =
      existing ??
      (await this.taxRepository.createAccount({
        userId,
        provider: this.getSelectedProviderName(),
        jurisdiction: 'US',
        status: this.isKycVerified(user)
          ? TaxAccountStatus.PENDING_PROVIDER
          : TaxAccountStatus.PENDING_KYC,
        metadata: null,
      }));

    if (!this.isKycVerified(user)) {
      return account;
    }
    if (!this.isProviderReady()) {
      if (account.status === TaxAccountStatus.PENDING_KYC) {
        return this.taxRepository.updateAccount(account.id, {
          status: TaxAccountStatus.PENDING_PROVIDER,
        });
      }
      return account;
    }
    if (account.status === TaxAccountStatus.ACTIVE) {
      return account;
    }

    try {
      const execution = await this.providerGateway.execute(
        'account_create',
        { userId, accountId: account.id, jurisdiction: 'US' },
        `tax-account-${account.id}`,
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
      const updated = await this.taxRepository.updateAccount(account.id, {
        status:
          succeeded && providerAccountId
            ? TaxAccountStatus.ACTIVE
            : TaxAccountStatus.PENDING_PROVIDER,
        providerAccountId,
        provider: this.getSelectedProviderName(),
        metadata: {
          providerStatus: execution.status,
          provisionedAt: new Date().toISOString(),
        },
      });
      return this.serializeAccount(updated);
    } catch (error) {
      const updated = await this.taxRepository.updateAccount(account.id, {
        status: TaxAccountStatus.PENDING_PROVIDER,
        metadata: { provisioningError: this.safeErrorMessage(error) },
      });
      return this.serializeAccount(updated);
    }
  }

  listFilings(userId: string) {
    return this.taxRepository.findFilings(userId);
  }

  async getFiling(userId: string, filingId: string) {
    const filing = await this.requireFiling(userId, filingId);
    const [documents, events] = await Promise.all([
      this.taxRepository.findDocuments(userId, filingId),
      this.taxRepository.findEvents(userId, filingId),
    ]);
    return { filing, documents, events };
  }

  async createFiling(userId: string, dto: CreateTaxFilingDto) {
    const byKey = await this.taxRepository.findFilingByIdempotency(
      userId,
      dto.idempotencyKey,
    );
    if (byKey) {
      return byKey;
    }
    const byYear = await this.taxRepository.findFilingByYear(
      userId,
      dto.taxYear,
    );
    if (byYear) {
      return byYear;
    }

    const account = await this.requireEligibleAccount(userId);
    this.validateTaxYear(dto.taxYear);
    const filing = await this.taxRepository.createFiling({
      userId,
      accountId: account.id,
      taxYear: dto.taxYear,
      idempotencyKey: dto.idempotencyKey,
      status: TaxFilingStatus.DRAFT,
      providerFilingId: null,
      currency: 'USD',
      estimatedRefund: null,
      estimatedAmountDue: null,
      providerSessionUrl: null,
      submittedAt: null,
      providerUpdatedAt: null,
      providerPayload: null,
    });
    await this.recordEvent(
      filing,
      null,
      TaxFilingStatus.DRAFT,
      TaxEventSource.USER,
    );
    return filing;
  }

  async createPreparationSession(
    userId: string,
    filingId: string,
    dto: TaxIdempotentDto,
  ) {
    const account = await this.requireActiveAccount(userId);
    const filing = await this.requireFiling(userId, filingId);
    if (TERMINAL_STATUSES.has(filing.status)) {
      throw new ConflictException('This filing can no longer be edited.');
    }

    const withSession = await this.taxRepository.findFilingWithSession(
      userId,
      filingId,
    );
    if (withSession?.providerSessionUrl) {
      return {
        filing,
        sessionUrl: withSession.providerSessionUrl,
      };
    }

    this.assertProviderReady('filing_start');
    const execution = await this.providerGateway.execute(
      'filing_start',
      {
        accountId: account.providerAccountId,
        filingId: filing.id,
        taxYear: filing.taxYear,
      },
      dto.idempotencyKey,
    );
    const sessionUrl = this.pickString(execution.data, 'sessionUrl');
    const providerFilingId =
      execution.providerReference ??
      this.pickString(execution.data, 'filingId');
    if (!sessionUrl || !providerFilingId) {
      throw new ServiceUnavailableException(
        'The tax provider did not return a filing session.',
      );
    }
    const previousStatus = filing.status;
    await this.taxRepository.updateFiling(filing.id, {
      status: TaxFilingStatus.PREPARING,
      providerFilingId,
      providerSessionUrl: sessionUrl,
      providerUpdatedAt: new Date(),
      providerPayload: execution.data,
    });
    await this.recordEvent(
      filing,
      previousStatus,
      TaxFilingStatus.PREPARING,
      TaxEventSource.USER,
    );
    return {
      filing: await this.requireFiling(userId, filingId),
      sessionUrl,
    };
  }

  async registerDocument(
    userId: string,
    filingId: string,
    dto: RegisterTaxDocumentDto,
  ) {
    const existing = await this.taxRepository.findDocumentByIdempotency(
      userId,
      dto.idempotencyKey,
    );
    if (existing) {
      return {
        document: this.serializeDocument(existing),
        uploadUrl: null,
      };
    }
    const account = await this.requireActiveAccount(userId);
    const filing = await this.requireFiling(userId, filingId);
    if (!filing.providerFilingId || TERMINAL_STATUSES.has(filing.status)) {
      throw new ConflictException(
        'Start an editable provider filing session before registering documents.',
      );
    }

    this.assertProviderReady('documents');
    const execution = await this.providerGateway.execute(
      'document_register',
      {
        accountId: account.providerAccountId,
        filingId: filing.providerFilingId,
        documentType: dto.type,
        originalFileName: dto.originalFileName ?? null,
        mimeType: dto.mimeType ?? null,
        sizeBytes: dto.sizeBytes ?? null,
      },
      dto.idempotencyKey,
    );
    const providerDocumentId =
      execution.providerReference ??
      this.pickString(execution.data, 'documentId');
    if (!providerDocumentId) {
      throw new ServiceUnavailableException(
        'The tax provider did not register the document.',
      );
    }
    const document = await this.taxRepository.createDocument({
      userId,
      filingId,
      idempotencyKey: dto.idempotencyKey,
      type: dto.type,
      status: TaxDocumentStatus.REGISTERED,
      providerDocumentId,
      originalFileName: dto.originalFileName ?? null,
      storageReference: null,
      mimeType: dto.mimeType ?? null,
      sizeBytes: dto.sizeBytes ?? null,
      providerPayload: execution.data,
    });
    return {
      document: this.serializeDocument(document),
      uploadUrl: this.pickString(execution.data, 'uploadUrl'),
    };
  }

  async submitFiling(userId: string, filingId: string, dto: TaxIdempotentDto) {
    const account = await this.requireActiveAccount(userId);
    const filing = await this.requireFiling(userId, filingId);
    if (filing.status === TaxFilingStatus.SUBMITTED) {
      return filing;
    }
    if (filing.status !== TaxFilingStatus.READY_TO_SUBMIT) {
      throw new ConflictException(
        'The filing must be marked ready by the tax provider before submission.',
      );
    }

    this.assertProviderReady('submit');
    const execution = await this.providerGateway.execute(
      'submit',
      {
        accountId: account.providerAccountId,
        filingId: filing.providerFilingId,
        taxYear: filing.taxYear,
      },
      dto.idempotencyKey,
    );
    const previousStatus = filing.status;
    await this.taxRepository.updateFiling(filing.id, {
      status: TaxFilingStatus.SUBMITTED,
      submittedAt: new Date(),
      providerUpdatedAt: new Date(),
      providerPayload: execution.data,
    });
    await this.recordEvent(
      filing,
      previousStatus,
      TaxFilingStatus.SUBMITTED,
      TaxEventSource.USER,
    );
    return this.requireFiling(userId, filingId);
  }

  async applyProviderStatus(input: {
    providerFilingId: string;
    status: TaxFilingStatus;
    providerEventId?: string | null;
    estimatedRefund?: string | null;
    estimatedAmountDue?: string | null;
    metadata?: Record<string, unknown> | null;
  }) {
    const filing = await this.taxRepository.findFilingByProviderId(
      input.providerFilingId,
    );
    if (!filing) {
      throw new NotFoundException('Tax filing provider reference not found.');
    }
    this.assertValidTransition(filing.status, input.status);
    if (input.estimatedRefund !== undefined && input.estimatedRefund !== null) {
      this.validateMoney(input.estimatedRefund);
    }
    if (
      input.estimatedAmountDue !== undefined &&
      input.estimatedAmountDue !== null
    ) {
      this.validateMoney(input.estimatedAmountDue);
    }
    await this.taxRepository.updateFiling(filing.id, {
      status: input.status,
      estimatedRefund: input.estimatedRefund ?? filing.estimatedRefund,
      estimatedAmountDue: input.estimatedAmountDue ?? filing.estimatedAmountDue,
      providerUpdatedAt: new Date(),
      providerPayload: input.metadata ?? null,
    });
    await this.recordEvent(
      filing,
      filing.status,
      input.status,
      TaxEventSource.PROVIDER,
      input.providerEventId,
      input.metadata,
    );
    return this.requireFiling(filing.userId, filing.id);
  }

  private async requireFiling(userId: string, filingId: string) {
    const filing = await this.taxRepository.findFilingForUser(userId, filingId);
    if (!filing) {
      throw new NotFoundException('Tax filing not found.');
    }
    return filing;
  }

  private async requireEligibleAccount(userId: string) {
    const account = await this.taxRepository.findAccount(userId);
    if (!account) {
      throw new NotFoundException('Tax account has not been opened.');
    }
    const user = await this.userRepository.getUserById(userId);
    this.assertEligibleUser(user);
    if (!this.isKycVerified(user)) {
      throw new PreconditionFailedException(
        'Verified KYC is required for tax filing.',
      );
    }
    return account;
  }

  private async requireActiveAccount(userId: string) {
    const account = await this.requireEligibleAccount(userId);
    if (account.status !== TaxAccountStatus.ACTIVE) {
      throw new ConflictException(
        'Tax account is not active with the provider.',
      );
    }
    return account;
  }

  private assertEligibleUser(user: any) {
    if (user.status !== AccountStatus.ACTIVE) {
      throw new PreconditionFailedException(
        'An active Vidal Pay account is required for tax filing.',
      );
    }
    if (this.resolveUserRegion(user) !== SupportedRegion.US) {
      throw new BadRequestException(
        'The configured tax filing providers currently support US accounts only.',
      );
    }
  }

  private isKycVerified(user: any) {
    return (
      user.kyc?.status === KycStatus.VERIFIED ||
      user.kycStatus === KycStatus.VERIFIED
    );
  }

  private resolveUserRegion(user: any): SupportedRegion | null {
    if (Object.values(SupportedRegion).includes(user.signupRegion)) {
      return user.signupRegion;
    }
    const countryCode = String(
      user.kyc?.countryCode ?? user.countryCode ?? '',
    ).toUpperCase();
    return countryCode === 'US'
      ? SupportedRegion.US
      : countryCode === 'NG'
        ? SupportedRegion.NG
        : null;
  }

  private getSelectedProviderName() {
    const slug = String(process.env.TAX_PROVIDER_MODE ?? 'april').toLowerCase();
    return slug === 'column' ? 'Column' : 'April';
  }

  private getProviderStatus() {
    const providerName = this.getSelectedProviderName();
    const provider = this.providerStatusService
      .getProviderStatuses()
      .find((candidate) => candidate.provider === providerName);
    if (!provider) {
      throw new ServiceUnavailableException(
        `${providerName} provider status is unavailable.`,
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
        `Tax ${capability} is unavailable until ${provider.provider} is certified.`,
      );
    }
  }

  private validateTaxYear(taxYear: number) {
    const currentYear = new Date().getUTCFullYear();
    if (taxYear < currentYear - 7 || taxYear > currentYear) {
      throw new BadRequestException(
        `taxYear must be between ${currentYear - 7} and ${currentYear}.`,
      );
    }
  }

  private assertValidTransition(
    current: TaxFilingStatus,
    next: TaxFilingStatus,
  ) {
    if (current === next) {
      return;
    }
    const allowed: Record<TaxFilingStatus, TaxFilingStatus[]> = {
      [TaxFilingStatus.DRAFT]: [
        TaxFilingStatus.PREPARING,
        TaxFilingStatus.NEEDS_ACTION,
      ],
      [TaxFilingStatus.PREPARING]: [
        TaxFilingStatus.NEEDS_ACTION,
        TaxFilingStatus.READY_TO_SUBMIT,
      ],
      [TaxFilingStatus.NEEDS_ACTION]: [
        TaxFilingStatus.PREPARING,
        TaxFilingStatus.READY_TO_SUBMIT,
      ],
      [TaxFilingStatus.READY_TO_SUBMIT]: [
        TaxFilingStatus.SUBMITTED,
        TaxFilingStatus.NEEDS_ACTION,
      ],
      [TaxFilingStatus.SUBMITTED]: [
        TaxFilingStatus.ACCEPTED,
        TaxFilingStatus.REJECTED,
        TaxFilingStatus.NEEDS_ACTION,
      ],
      [TaxFilingStatus.REJECTED]: [
        TaxFilingStatus.NEEDS_ACTION,
        TaxFilingStatus.AMENDED,
      ],
      [TaxFilingStatus.AMENDED]: [TaxFilingStatus.SUBMITTED],
      [TaxFilingStatus.ACCEPTED]: [TaxFilingStatus.CLOSED],
      [TaxFilingStatus.CLOSED]: [],
    };
    if (!allowed[current].includes(next)) {
      throw new ConflictException(
        `Tax filing cannot move from ${current} to ${next}.`,
      );
    }
  }

  private validateMoney(value: string) {
    if (!/^\d+(?:\.\d{1,18})?$/.test(value)) {
      throw new BadRequestException('Invalid tax amount.');
    }
  }

  private async recordEvent(
    filing: TaxFiling,
    previousStatus: TaxFilingStatus | null,
    status: TaxFilingStatus,
    source: TaxEventSource,
    providerEventId: string | null = null,
    metadata: Record<string, unknown> | null = null,
  ) {
    await this.taxRepository.createEvent({
      userId: filing.userId,
      filingId: filing.id,
      previousStatus,
      status,
      source,
      providerEventId,
      metadata,
    });
  }

  private serializeDocument(document: any) {
    const {
      storageReference: _storageReference,
      providerPayload: _providerPayload,
      ...safeDocument
    } = document;
    return safeDocument;
  }

  private serializeAccount(account: any) {
    const { metadata: _metadata, ...safeAccount } = account;
    return safeAccount;
  }

  private pickString(data: Record<string, unknown>, key: string) {
    const value = data[key];
    return typeof value === 'string' && value.trim() ? value : null;
  }

  private safeErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Provider request failed.';
  }
}
