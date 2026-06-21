import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { KycStatus } from 'src/common/enum/kyc-status.enum';
import { SupportedRegion } from 'src/common/enum/supported-region.enum';
import { AccountStatus } from 'src/database/entities/user.entity';
import {
  LoanAccountStatus,
  LoanApplicationStatus,
  LoanEligibilityStatus,
  LoanOfferStatus,
  LoanPurpose,
} from './loan.enums';
import { LoanService } from './loan.service';

describe('LoanService', () => {
  const currentEligibility = {
    id: 'eligibility-id',
    userId: 'user-id',
    status: LoanEligibilityStatus.ELIGIBLE,
    eligible: true,
    maximumAmount: '10000',
    currency: 'NGN',
    riskBand: 'A',
    expiresAt: new Date(Date.now() + 60_000),
    consentVersion: 'credit-check-v1',
    consentedAt: new Date(),
    decisionMetadata: { privateScore: 700 },
  };

  const createSubject = (overrides: Record<string, any> = {}) => {
    const repository = {
      findEligibility: jest.fn().mockResolvedValue(currentEligibility),
      upsertEligibility: jest.fn().mockResolvedValue(undefined),
      findApplications: jest.fn().mockResolvedValue([]),
      findApplicationByIdempotency: jest.fn().mockResolvedValue(null),
      findApplicationForUser: jest.fn().mockResolvedValue(null),
      findApplicationByProviderId: jest.fn().mockResolvedValue(null),
      createApplication: jest.fn().mockImplementation(async (input) => ({
        id: 'application-id',
        ...input,
      })),
      updateApplication: jest.fn().mockImplementation(async (id, input) => ({
        id,
        ...input,
      })),
      findOffers: jest.fn().mockResolvedValue([]),
      findOfferForUser: jest.fn().mockResolvedValue(null),
      findOfferByProviderId: jest.fn().mockResolvedValue(null),
      createOffer: jest.fn().mockImplementation(async (input) => ({
        id: 'offer-id',
        ...input,
      })),
      updateOffer: jest.fn().mockImplementation(async (id, input) => ({
        id,
        ...input,
      })),
      findLoans: jest.fn().mockResolvedValue([]),
      findLoanByOfferId: jest.fn().mockResolvedValue(null),
      findLoanForUser: jest.fn().mockResolvedValue(null),
      findLoanByProviderId: jest.fn().mockResolvedValue(null),
      createLoan: jest.fn().mockImplementation(async (input) => ({
        id: 'loan-id',
        ...input,
      })),
      updateLoan: jest.fn().mockImplementation(async (id, input) => ({
        id,
        ...input,
      })),
      upsertInstallment: jest.fn().mockResolvedValue(undefined),
      findInstallments: jest.fn().mockResolvedValue([]),
      findRepaymentByIdempotency: jest.fn().mockResolvedValue(null),
      createRepayment: jest.fn().mockImplementation(async (input) => input),
      findRepayments: jest.fn().mockResolvedValue([]),
      ...overrides.repository,
    };
    const userRepository = {
      getUserById: jest.fn().mockResolvedValue({
        id: 'user-id',
        status: AccountStatus.ACTIVE,
        signupRegion: SupportedRegion.NG,
        kycStatus: KycStatus.VERIFIED,
        kyc: { status: KycStatus.VERIFIED, countryCode: 'NG' },
      }),
      ...overrides.userRepository,
    };
    const gateway = {
      execute: jest
        .fn()
        .mockRejectedValue(
          new ServiceUnavailableException('No lender connected.'),
        ),
      ...overrides.gateway,
    };
    return {
      subject: new LoanService(
        repository as any,
        userRepository as any,
        gateway as any,
      ),
      repository,
      gateway,
    };
  };

  it('records explicit credit-check consent without exposing decision metadata', async () => {
    const pending = {
      ...currentEligibility,
      status: LoanEligibilityStatus.PENDING_PROVIDER,
      eligible: null,
      decisionMetadata: { idempotencyKey: 'eligibility-request-1' },
    };
    const { subject, repository } = createSubject({
      repository: { findEligibility: jest.fn().mockResolvedValue(pending) },
    });

    const result = await subject.requestEligibility('user-id', {
      idempotencyKey: 'eligibility-request-1',
      consentToCreditCheck: true,
    });

    expect(repository.upsertEligibility).toHaveBeenCalledWith(
      expect.objectContaining({
        consentVersion: 'credit-check-v1',
        status: LoanEligibilityStatus.PENDING_PROVIDER,
        eligible: null,
      }),
    );
    expect(result).not.toHaveProperty('decisionMetadata');
  });

  it('creates a consented application as pending, never locally approved', async () => {
    const { subject } = createSubject();

    await expect(
      subject.createApplication('user-id', {
        idempotencyKey: 'loan-application-1',
        requestedAmount: '5000',
        requestedTermMonths: 12,
        purpose: LoanPurpose.PERSONAL,
        consentToLoanApplication: true,
      }),
    ).resolves.toMatchObject({
      status: LoanApplicationStatus.PENDING_PROVIDER,
      requestedAmount: '5000',
      currency: 'NGN',
    });
  });

  it('enforces the authoritative eligibility maximum exactly', async () => {
    const { subject } = createSubject();

    await expect(
      subject.createApplication('user-id', {
        idempotencyKey: 'loan-application-1',
        requestedAmount: '10000.000000000000000001',
        requestedTermMonths: 12,
        purpose: LoanPurpose.PERSONAL,
        consentToLoanApplication: true,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows only provider-referenced offers with internally consistent terms', async () => {
    const { subject, repository } = createSubject({
      repository: {
        findApplicationByProviderId: jest.fn().mockResolvedValue({
          id: 'application-id',
          userId: 'user-id',
        }),
      },
    });

    await expect(
      subject.applyProviderOffer({
        providerApplicationId: 'provider-application-id',
        providerOfferId: 'provider-offer-id',
        principal: '5000',
        currency: 'NGN',
        annualPercentageRate: '18.50000000',
        termMonths: 12,
        installmentAmount: '500',
        totalRepayment: '6000',
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).resolves.toMatchObject({
      status: LoanOfferStatus.PENDING,
      providerOfferId: 'provider-offer-id',
    });
    expect(repository.updateApplication).toHaveBeenCalledWith(
      'application-id',
      { status: LoanApplicationStatus.OFFERED },
    );
  });

  it('rejects a provider offer whose repayment is below principal', async () => {
    const { subject } = createSubject({
      repository: {
        findApplicationByProviderId: jest.fn().mockResolvedValue({
          id: 'application-id',
          userId: 'user-id',
        }),
      },
    });

    await expect(
      subject.applyProviderOffer({
        providerApplicationId: 'provider-application-id',
        providerOfferId: 'provider-offer-id',
        principal: '5000',
        currency: 'NGN',
        annualPercentageRate: '18.5',
        termMonths: 12,
        installmentAmount: '300',
        totalRepayment: '4000',
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('does not accept an offer while no lender is connected', async () => {
    const { subject, repository } = createSubject({
      repository: {
        findOfferForUser: jest.fn().mockResolvedValue({
          id: 'offer-id',
          userId: 'user-id',
          providerOfferId: 'provider-offer-id',
          status: LoanOfferStatus.PENDING,
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
    });

    await expect(
      subject.acceptOffer('user-id', 'offer-id', {
        idempotencyKey: 'offer-accept-request-1',
      }),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(repository.createLoan).not.toHaveBeenCalled();
  });

  it('persists only provider-authoritative disbursement schedules', async () => {
    const loan = {
      id: 'loan-id',
      userId: 'user-id',
      status: LoanAccountStatus.PENDING_DISBURSEMENT,
    };
    const { subject, repository } = createSubject({
      repository: {
        findLoanByProviderId: jest.fn().mockResolvedValue(loan),
        findLoanForUser: jest.fn().mockResolvedValue({
          ...loan,
          status: LoanAccountStatus.ACTIVE,
        }),
      },
    });

    await subject.applyDisbursement({
      providerLoanId: 'provider-loan-id',
      disbursedAt: new Date(),
      maturityDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      outstandingPrincipal: '5000',
      accruedInterest: '0',
      totalOutstanding: '6000',
      schedule: [
        {
          installmentNumber: 1,
          dueDate: '2026-07-01',
          principalDue: '400',
          interestDue: '100',
          feeDue: '0',
          totalDue: '500',
        },
      ],
    });

    expect(repository.updateLoan).toHaveBeenCalledWith(
      loan.id,
      expect.objectContaining({ status: LoanAccountStatus.ACTIVE }),
    );
    expect(repository.upsertInstallment).toHaveBeenCalledWith(
      expect.objectContaining({ installmentNumber: 1, totalDue: '500' }),
    );
  });
});
