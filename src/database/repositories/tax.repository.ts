import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { TaxAccount } from '../entities/tax-account.entity';
import { TaxDocument } from '../entities/tax-document.entity';
import { TaxFilingEvent } from '../entities/tax-filing-event.entity';
import { TaxFiling } from '../entities/tax-filing.entity';

@Injectable()
export class TaxRepository {
  constructor(
    @InjectRepository(TaxAccount)
    private readonly accounts: Repository<TaxAccount>,
    @InjectRepository(TaxFiling)
    private readonly filings: Repository<TaxFiling>,
    @InjectRepository(TaxDocument)
    private readonly documents: Repository<TaxDocument>,
    @InjectRepository(TaxFilingEvent)
    private readonly events: Repository<TaxFilingEvent>,
  ) {}

  findAccount(userId: string) {
    return this.accounts.findOne({ where: { userId } });
  }

  createAccount(input: DeepPartial<TaxAccount>) {
    return this.accounts.save(this.accounts.create(input));
  }

  updateAccount(id: string, input: DeepPartial<TaxAccount>) {
    return this.accounts.save(this.accounts.create({ id, ...input }));
  }

  findFilingByYear(userId: string, taxYear: number) {
    return this.filings.findOne({ where: { userId, taxYear } });
  }

  findFilingByIdempotency(userId: string, idempotencyKey: string) {
    return this.filings.findOne({ where: { userId, idempotencyKey } });
  }

  findFilingForUser(userId: string, id: string) {
    return this.filings.findOne({ where: { id, userId } });
  }

  findFilingWithSession(userId: string, id: string) {
    return this.filings
      .createQueryBuilder('filing')
      .addSelect('filing.providerSessionUrl')
      .where('filing.id = :id', { id })
      .andWhere('filing.userId = :userId', { userId })
      .andWhere('filing.deletedAt IS NULL')
      .getOne();
  }

  findFilingByProviderId(providerFilingId: string) {
    return this.filings.findOne({ where: { providerFilingId } });
  }

  createFiling(input: DeepPartial<TaxFiling>) {
    return this.filings.save(this.filings.create(input));
  }

  updateFiling(id: string, input: DeepPartial<TaxFiling>) {
    return this.filings.save(this.filings.create({ id, ...input }));
  }

  findFilings(userId: string) {
    return this.filings.find({
      where: { userId },
      order: { taxYear: 'DESC' },
    });
  }

  findDocumentByIdempotency(userId: string, idempotencyKey: string) {
    return this.documents.findOne({ where: { userId, idempotencyKey } });
  }

  createDocument(input: DeepPartial<TaxDocument>) {
    return this.documents.save(this.documents.create(input));
  }

  findDocuments(userId: string, filingId: string) {
    return this.documents.find({
      where: { userId, filingId },
      order: { createdAt: 'DESC' },
    });
  }

  createEvent(input: DeepPartial<TaxFilingEvent>) {
    return this.events.save(this.events.create(input));
  }

  findEvents(userId: string, filingId: string) {
    return this.events.find({
      where: { userId, filingId },
      order: { createdAt: 'ASC' },
    });
  }
}
