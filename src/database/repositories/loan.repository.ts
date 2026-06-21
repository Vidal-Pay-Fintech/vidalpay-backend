import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { LoanAccount } from '../entities/loan-account.entity';
import { LoanApplication } from '../entities/loan-application.entity';
import { LoanEligibility } from '../entities/loan-eligibility.entity';
import { LoanInstallment } from '../entities/loan-installment.entity';
import { LoanOffer } from '../entities/loan-offer.entity';
import { LoanRepayment } from '../entities/loan-repayment.entity';

@Injectable()
export class LoanRepository {
  constructor(
    @InjectRepository(LoanEligibility)
    private readonly eligibility: Repository<LoanEligibility>,
    @InjectRepository(LoanApplication)
    private readonly applications: Repository<LoanApplication>,
    @InjectRepository(LoanOffer)
    private readonly offers: Repository<LoanOffer>,
    @InjectRepository(LoanAccount)
    private readonly loans: Repository<LoanAccount>,
    @InjectRepository(LoanInstallment)
    private readonly installments: Repository<LoanInstallment>,
    @InjectRepository(LoanRepayment)
    private readonly repayments: Repository<LoanRepayment>,
  ) {}

  findEligibility(userId: string) {
    return this.eligibility.findOne({ where: { userId } });
  }

  upsertEligibility(input: DeepPartial<LoanEligibility>) {
    return this.eligibility.upsert(input as any, ['userId']);
  }

  findApplicationByIdempotency(userId: string, idempotencyKey: string) {
    return this.applications.findOne({ where: { userId, idempotencyKey } });
  }

  findApplicationForUser(userId: string, id: string) {
    return this.applications.findOne({ where: { id, userId } });
  }

  findApplicationByProviderId(providerApplicationId: string) {
    return this.applications.findOne({ where: { providerApplicationId } });
  }

  createApplication(input: DeepPartial<LoanApplication>) {
    return this.applications.save(this.applications.create(input));
  }

  updateApplication(id: string, input: DeepPartial<LoanApplication>) {
    return this.applications.save(this.applications.create({ id, ...input }));
  }

  findApplications(userId: string) {
    return this.applications.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  findOfferForUser(userId: string, id: string) {
    return this.offers.findOne({ where: { id, userId } });
  }

  findOfferByProviderId(providerOfferId: string) {
    return this.offers.findOne({ where: { providerOfferId } });
  }

  createOffer(input: DeepPartial<LoanOffer>) {
    return this.offers.save(this.offers.create(input));
  }

  updateOffer(id: string, input: DeepPartial<LoanOffer>) {
    return this.offers.save(this.offers.create({ id, ...input }));
  }

  findOffers(userId: string) {
    return this.offers.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  findLoanByOfferId(offerId: string) {
    return this.loans.findOne({ where: { offerId } });
  }

  findLoanForUser(userId: string, id: string) {
    return this.loans.findOne({ where: { id, userId } });
  }

  findLoanByProviderId(providerLoanId: string) {
    return this.loans.findOne({ where: { providerLoanId } });
  }

  createLoan(input: DeepPartial<LoanAccount>) {
    return this.loans.save(this.loans.create(input));
  }

  updateLoan(id: string, input: DeepPartial<LoanAccount>) {
    return this.loans.save(this.loans.create({ id, ...input }));
  }

  findLoans(userId: string) {
    return this.loans.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  upsertInstallment(input: DeepPartial<LoanInstallment>) {
    return this.installments.upsert(input as any, [
      'loanId',
      'installmentNumber',
    ]);
  }

  findInstallments(userId: string, loanId: string) {
    return this.installments.find({
      where: { userId, loanId },
      order: { installmentNumber: 'ASC' },
    });
  }

  findRepaymentByIdempotency(userId: string, idempotencyKey: string) {
    return this.repayments.findOne({ where: { userId, idempotencyKey } });
  }

  createRepayment(input: DeepPartial<LoanRepayment>) {
    return this.repayments.save(this.repayments.create(input));
  }

  updateRepayment(id: string, input: DeepPartial<LoanRepayment>) {
    return this.repayments.save(this.repayments.create({ id, ...input }));
  }

  findRepayments(userId: string, loanId: string) {
    return this.repayments.find({
      where: { userId, loanId },
      order: { createdAt: 'DESC' },
    });
  }
}
