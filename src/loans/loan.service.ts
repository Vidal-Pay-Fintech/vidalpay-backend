import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { KycStatus } from 'src/common/enum/kyc-status.enum';
import { SupportedRegion } from 'src/common/enum/supported-region.enum';
import { AccountStatus } from 'src/database/entities/user.entity';
import { LoanRepository } from 'src/database/repositories/loan.repository';
import { UserRepository } from 'src/database/repositories/user.repository';
import {
  CreateLoanApplicationDto,
  CreateLoanRepaymentDto,
  LoanIdempotentDto,
  RequestLoanEligibilityDto,
} from './dto/loan-request.dto';
import {
  LoanAccountStatus,
  LoanApplicationStatus,
  LoanEligibilityStatus,
  LoanInstallmentStatus,
  LoanOfferStatus,
  LoanRepaymentStatus,
} from './loan.enums';
import { LoanProviderGateway } from './loan-provider.gateway';

const CREDIT_CONSENT_VERSION = 'credit-check-v1';
const APPLICATION_CONSENT_VERSION = 'loan-application-v1';

@Injectable()
export class LoanService {
  constructor(
    private readonly loanRepository: LoanRepository,
    private readonly userRepository: UserRepository,
    private readonly providerGateway: LoanProviderGateway,
  ) {}

  async getOverview(userId: string) {
    const [eligibility, applications, offers, loans] = await Promise.all([
      this.loanRepository.findEligibility(userId),
      this.loanRepository.findApplications(userId),
      this.loanRepository.findOffers(userId),
      this.loanRepository.findLoans(userId),
    ]);
    return {
      enabled: false,
      provider: {
        connected: false,
        status: 'PROVIDER_REQUIRED',
        message: 'A licensed lending provider has not been connected.',
      },
      eligibility: this.serializeEligibility(eligibility),
      applications,
      offers,
      loans,
    };
  }

  async getEligibility(userId: string) {
    const eligibility = await this.loanRepository.findEligibility(userId);
    return this.serializeEligibility(eligibility);
  }

  async requestEligibility(userId: string, dto: RequestLoanEligibilityDto) {
    const user = await this.requireEligibleUser(userId);
    const currency = this.resolveCurrency(user);
    const consentedAt = new Date();
    const expiresAt = new Date(consentedAt.getTime() + 60 * 60 * 1000);
    await this.loanRepository.upsertEligibility({
      userId,
      status: LoanEligibilityStatus.PENDING_PROVIDER,
      eligible: null,
      maximumAmount: null,
      currency,
      riskBand: null,
      expiresAt,
      consentVersion: CREDIT_CONSENT_VERSION,
      consentedAt,
      providerReference: null,
      decisionMetadata: {
        idempotencyKey: dto.idempotencyKey,
      },
    });

    let execution;
    try {
      execution = await this.providerGateway.execute(
        'eligibility_check',
        { userId, currency, consentVersion: CREDIT_CONSENT_VERSION },
        dto.idempotencyKey,
      );
    } catch {
      return this.getEligibility(userId);
    }
    return this.applyEligibilityDecision(userId, {
      eligible: execution.data.eligible === true,
      maximumAmount: this.pickString(execution.data, 'maximumAmount'),
      currency,
      riskBand: this.pickString(execution.data, 'riskBand'),
      expiresAt: this.pickDate(execution.data, 'expiresAt') ?? expiresAt,
      providerReference: execution.providerReference,
      metadata: execution.data,
    });
  }

  listApplications(userId: string) {
    return this.loanRepository.findApplications(userId);
  }

  async getApplication(userId: string, applicationId: string) {
    const application = await this.loanRepository.findApplicationForUser(
      userId,
      applicationId,
    );
    if (!application) {
      throw new NotFoundException('Loan application not found.');
    }
    return application;
  }

  async createApplication(userId: string, dto: CreateLoanApplicationDto) {
    const existing = await this.loanRepository.findApplicationByIdempotency(
      userId,
      dto.idempotencyKey,
    );
    if (existing) {
      return existing;
    }
    const user = await this.requireEligibleUser(userId);
    const eligibility = await this.requireCurrentEligibility(userId);
    if (
      eligibility.maximumAmount &&
      this.toAtomicUnits(dto.requestedAmount) >
        this.toAtomicUnits(eligibility.maximumAmount)
    ) {
      throw new BadRequestException(
        `Requested amount exceeds the current eligibility limit of ${eligibility.maximumAmount} ${eligibility.currency}.`,
      );
    }
    const activeLoans = await this.loanRepository.findLoans(userId);
    if (
      activeLoans.some((loan) =>
        [
          LoanAccountStatus.PENDING_DISBURSEMENT,
          LoanAccountStatus.ACTIVE,
          LoanAccountStatus.DELINQUENT,
        ].includes(loan.status),
      )
    ) {
      throw new ConflictException(
        'A new application cannot be created while another loan is active.',
      );
    }

    const application = await this.loanRepository.createApplication({
      userId,
      idempotencyKey: dto.idempotencyKey,
      requestedAmount: dto.requestedAmount,
      currency: this.resolveCurrency(user),
      requestedTermMonths: dto.requestedTermMonths,
      purpose: dto.purpose,
      status: LoanApplicationStatus.PENDING_PROVIDER,
      consentVersion: APPLICATION_CONSENT_VERSION,
      consentedAt: new Date(),
      providerApplicationId: null,
      decisionReason: null,
      providerPayload: null,
    });

    let execution;
    try {
      execution = await this.providerGateway.execute(
        'application_submit',
        {
          applicationId: application.id,
          userId,
          requestedAmount: application.requestedAmount,
          currency: application.currency,
          requestedTermMonths: application.requestedTermMonths,
          purpose: application.purpose,
          consentVersion: application.consentVersion,
        },
        dto.idempotencyKey,
      );
    } catch {
      return application;
    }
    await this.loanRepository.updateApplication(application.id, {
      status: LoanApplicationStatus.UNDER_REVIEW,
      providerApplicationId: execution.providerReference,
      providerPayload: execution.data,
    });
    return this.getApplication(userId, application.id);
  }

  async withdrawApplication(userId: string, applicationId: string) {
    const application = await this.getApplication(userId, applicationId);
    if (
      ![
        LoanApplicationStatus.PENDING_PROVIDER,
        LoanApplicationStatus.UNDER_REVIEW,
      ].includes(application.status)
    ) {
      throw new ConflictException('Loan application cannot be withdrawn.');
    }
    await this.loanRepository.updateApplication(application.id, {
      status: LoanApplicationStatus.WITHDRAWN,
    });
    return this.getApplication(userId, application.id);
  }

  listOffers(userId: string) {
    return this.loanRepository.findOffers(userId);
  }

  async acceptOffer(userId: string, offerId: string, dto: LoanIdempotentDto) {
    await this.requireEligibleUser(userId);
    const offer = await this.loanRepository.findOfferForUser(userId, offerId);
    if (!offer) {
      throw new NotFoundException('Loan offer not found.');
    }
    if (offer.status === LoanOfferStatus.ACCEPTED) {
      return this.loanRepository.findLoanByOfferId(offer.id);
    }
    if (offer.status !== LoanOfferStatus.PENDING) {
      throw new ConflictException(
        'Loan offer is not available for acceptance.',
      );
    }
    if (offer.expiresAt.getTime() <= Date.now()) {
      await this.loanRepository.updateOffer(offer.id, {
        status: LoanOfferStatus.EXPIRED,
      });
      throw new ConflictException('Loan offer has expired.');
    }

    const execution = await this.providerGateway.execute(
      'offer_accept',
      { providerOfferId: offer.providerOfferId },
      dto.idempotencyKey,
    );
    if (
      !['ACCEPTED', 'COMPLETED', 'SUCCESS', 'SUCCEEDED'].includes(
        execution.status.toUpperCase(),
      )
    ) {
      throw new ConflictException(
        'The lending provider did not accept the offer.',
      );
    }
    const providerLoanId =
      execution.providerReference ?? this.pickString(execution.data, 'loanId');
    if (!providerLoanId) {
      throw new ConflictException(
        'The lending provider did not return a loan reference.',
      );
    }
    const existingLoan = await this.loanRepository.findLoanByOfferId(offer.id);
    if (existingLoan) {
      await this.loanRepository.updateOffer(offer.id, {
        status: LoanOfferStatus.ACCEPTED,
        acceptedAt: offer.acceptedAt ?? new Date(),
      });
      return existingLoan;
    }
    const loan = await this.loanRepository.createLoan({
      userId,
      offerId: offer.id,
      providerLoanId,
      status: LoanAccountStatus.PENDING_DISBURSEMENT,
      principal: offer.principal,
      outstandingPrincipal: offer.principal,
      accruedInterest: '0',
      totalOutstanding: offer.totalRepayment,
      currency: offer.currency,
      disbursedAt: null,
      maturityDate: null,
      providerPayload: execution.data,
    });
    await this.loanRepository.updateOffer(offer.id, {
      status: LoanOfferStatus.ACCEPTED,
      acceptedAt: new Date(),
      providerPayload: execution.data,
    });
    return loan;
  }

  async declineOffer(userId: string, offerId: string) {
    const offer = await this.loanRepository.findOfferForUser(userId, offerId);
    if (!offer) {
      throw new NotFoundException('Loan offer not found.');
    }
    if (offer.status !== LoanOfferStatus.PENDING) {
      return offer;
    }
    return this.loanRepository.updateOffer(offer.id, {
      status: LoanOfferStatus.DECLINED,
    });
  }

  listLoans(userId: string) {
    return this.loanRepository.findLoans(userId);
  }

  async getLoan(userId: string, loanId: string) {
    const loan = await this.requireLoan(userId, loanId);
    const [schedule, repayments] = await Promise.all([
      this.loanRepository.findInstallments(userId, loanId),
      this.loanRepository.findRepayments(userId, loanId),
    ]);
    return { loan, schedule, repayments };
  }

  async repay(userId: string, loanId: string, dto: CreateLoanRepaymentDto) {
    const existing = await this.loanRepository.findRepaymentByIdempotency(
      userId,
      dto.idempotencyKey,
    );
    if (existing) {
      return existing;
    }
    await this.requireEligibleUser(userId);
    const loan = await this.requireLoan(userId, loanId);
    if (
      ![LoanAccountStatus.ACTIVE, LoanAccountStatus.DELINQUENT].includes(
        loan.status,
      )
    ) {
      throw new ConflictException('Loan is not accepting repayments.');
    }
    if (
      this.toAtomicUnits(dto.amount) > this.toAtomicUnits(loan.totalOutstanding)
    ) {
      throw new BadRequestException(
        'Repayment amount exceeds the outstanding balance.',
      );
    }

    const execution = await this.providerGateway.execute(
      'repayment',
      {
        providerLoanId: loan.providerLoanId,
        amount: dto.amount,
        currency: loan.currency,
      },
      dto.idempotencyKey,
    );
    return this.loanRepository.createRepayment({
      userId,
      loanId,
      idempotencyKey: dto.idempotencyKey,
      amount: dto.amount,
      currency: loan.currency,
      status: LoanRepaymentStatus.PENDING,
      providerReference: execution.providerReference,
      completedAt: null,
      providerPayload: execution.data,
    });
  }

  async applyEligibilityDecision(
    userId: string,
    input: {
      eligible: boolean;
      maximumAmount: string | null;
      currency: string;
      riskBand: string | null;
      expiresAt: Date;
      providerReference: string | null;
      metadata?: Record<string, unknown> | null;
    },
  ) {
    if (input.maximumAmount) {
      this.toAtomicUnits(input.maximumAmount);
    }
    const current = await this.loanRepository.findEligibility(userId);
    await this.loanRepository.upsertEligibility({
      userId,
      status: input.eligible
        ? LoanEligibilityStatus.ELIGIBLE
        : LoanEligibilityStatus.INELIGIBLE,
      eligible: input.eligible,
      maximumAmount: input.maximumAmount,
      currency: input.currency,
      riskBand: input.riskBand,
      expiresAt: input.expiresAt,
      consentVersion: current?.consentVersion ?? CREDIT_CONSENT_VERSION,
      consentedAt: current?.consentedAt ?? new Date(),
      providerReference: input.providerReference,
      decisionMetadata: input.metadata ?? null,
    });
    return this.getEligibility(userId);
  }

  async applyProviderOffer(input: {
    providerApplicationId: string;
    providerOfferId: string;
    principal: string;
    currency: string;
    annualPercentageRate: string;
    termMonths: number;
    installmentAmount: string;
    totalRepayment: string;
    expiresAt: Date;
    providerPayload?: Record<string, unknown> | null;
  }) {
    const application = await this.loanRepository.findApplicationByProviderId(
      input.providerApplicationId,
    );
    if (!application) {
      throw new NotFoundException(
        'Loan application provider reference not found.',
      );
    }
    const existing = await this.loanRepository.findOfferByProviderId(
      input.providerOfferId,
    );
    if (existing) {
      return existing;
    }
    this.validateOffer(input);
    const offer = await this.loanRepository.createOffer({
      userId: application.userId,
      applicationId: application.id,
      providerOfferId: input.providerOfferId,
      principal: input.principal,
      currency: input.currency,
      annualPercentageRate: input.annualPercentageRate,
      termMonths: input.termMonths,
      installmentAmount: input.installmentAmount,
      totalRepayment: input.totalRepayment,
      status: LoanOfferStatus.PENDING,
      expiresAt: input.expiresAt,
      acceptedAt: null,
      providerPayload: input.providerPayload ?? null,
    });
    await this.loanRepository.updateApplication(application.id, {
      status: LoanApplicationStatus.OFFERED,
    });
    return offer;
  }

  async applyDisbursement(input: {
    providerLoanId: string;
    disbursedAt: Date;
    maturityDate: Date;
    outstandingPrincipal: string;
    accruedInterest: string;
    totalOutstanding: string;
    schedule: Array<{
      installmentNumber: number;
      dueDate: string;
      principalDue: string;
      interestDue: string;
      feeDue: string;
      totalDue: string;
    }>;
  }) {
    const loan = await this.loanRepository.findLoanByProviderId(
      input.providerLoanId,
    );
    if (!loan) {
      throw new NotFoundException('Loan provider reference not found.');
    }
    for (const amount of [
      input.outstandingPrincipal,
      input.accruedInterest,
      input.totalOutstanding,
    ]) {
      this.toAtomicUnits(amount);
    }
    await this.loanRepository.updateLoan(loan.id, {
      status: LoanAccountStatus.ACTIVE,
      outstandingPrincipal: input.outstandingPrincipal,
      accruedInterest: input.accruedInterest,
      totalOutstanding: input.totalOutstanding,
      disbursedAt: input.disbursedAt,
      maturityDate: input.maturityDate,
    });
    for (const installment of input.schedule) {
      for (const amount of [
        installment.principalDue,
        installment.interestDue,
        installment.feeDue,
        installment.totalDue,
      ]) {
        this.toAtomicUnits(amount);
      }
      await this.loanRepository.upsertInstallment({
        userId: loan.userId,
        loanId: loan.id,
        installmentNumber: installment.installmentNumber,
        dueDate: installment.dueDate,
        principalDue: installment.principalDue,
        interestDue: installment.interestDue,
        feeDue: installment.feeDue,
        totalDue: installment.totalDue,
        amountPaid: '0',
        status: LoanInstallmentStatus.DUE,
      });
    }
    return this.getLoan(loan.userId, loan.id);
  }

  private async requireCurrentEligibility(userId: string) {
    const eligibility = await this.loanRepository.findEligibility(userId);
    if (
      !eligibility ||
      eligibility.status !== LoanEligibilityStatus.ELIGIBLE ||
      eligibility.eligible !== true ||
      eligibility.expiresAt.getTime() <= Date.now()
    ) {
      throw new PreconditionFailedException(
        'A current positive lending eligibility decision is required.',
      );
    }
    return eligibility;
  }

  private async requireEligibleUser(userId: string) {
    const user = await this.userRepository.getUserById(userId);
    if (user.status !== AccountStatus.ACTIVE) {
      throw new PreconditionFailedException(
        'An active Vidal Pay account is required for lending products.',
      );
    }
    if (
      user.kyc?.status !== KycStatus.VERIFIED &&
      user.kycStatus !== KycStatus.VERIFIED
    ) {
      throw new PreconditionFailedException(
        'Verified KYC is required for lending products.',
      );
    }
    if (!this.resolveRegion(user)) {
      throw new BadRequestException('A supported account region is required.');
    }
    return user;
  }

  private async requireLoan(userId: string, loanId: string) {
    const loan = await this.loanRepository.findLoanForUser(userId, loanId);
    if (!loan) {
      throw new NotFoundException('Loan account not found.');
    }
    return loan;
  }

  private resolveRegion(user: any): SupportedRegion | null {
    if (Object.values(SupportedRegion).includes(user.signupRegion)) {
      return user.signupRegion;
    }
    const code = String(
      user.kyc?.countryCode ?? user.countryCode ?? '',
    ).toUpperCase();
    return code === 'NG'
      ? SupportedRegion.NG
      : code === 'US'
        ? SupportedRegion.US
        : null;
  }

  private resolveCurrency(user: any) {
    return this.resolveRegion(user) === SupportedRegion.NG ? 'NGN' : 'USD';
  }

  private serializeEligibility(eligibility: any) {
    if (!eligibility) {
      return null;
    }
    const { decisionMetadata: _decisionMetadata, ...safeEligibility } =
      eligibility;
    return {
      ...safeEligibility,
      expired: eligibility.expiresAt.getTime() <= Date.now(),
    };
  }

  private validateOffer(input: {
    principal: string;
    annualPercentageRate: string;
    installmentAmount: string;
    totalRepayment: string;
    termMonths: number;
    expiresAt: Date;
  }) {
    for (const amount of [
      input.principal,
      input.installmentAmount,
      input.totalRepayment,
    ]) {
      this.toAtomicUnits(amount);
    }
    if (!/^\d+(?:\.\d{1,8})?$/.test(input.annualPercentageRate)) {
      throw new BadRequestException('Invalid annual percentage rate.');
    }
    if (
      this.toAtomicUnits(input.totalRepayment) <
      this.toAtomicUnits(input.principal)
    ) {
      throw new BadRequestException(
        'Total repayment cannot be less than principal.',
      );
    }
    if (input.termMonths < 1 || input.termMonths > 60) {
      throw new BadRequestException(
        'Loan term must be between 1 and 60 months.',
      );
    }
    if (input.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Loan offer expiry must be in the future.');
    }
  }

  private toAtomicUnits(value: string): bigint {
    if (!/^\d+(?:\.\d{1,18})?$/.test(String(value))) {
      throw new BadRequestException('Invalid loan decimal amount.');
    }
    const [whole, fraction = ''] = String(value).split('.');
    return BigInt(`${whole}${fraction.padEnd(18, '0').slice(0, 18)}`);
  }

  private pickString(data: Record<string, unknown>, key: string) {
    const value = data[key];
    return typeof value === 'string' && value.trim() ? value : null;
  }

  private pickDate(data: Record<string, unknown>, key: string) {
    const value = data[key];
    if (typeof value !== 'string') {
      return null;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
