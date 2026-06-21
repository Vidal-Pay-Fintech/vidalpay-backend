import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Not, Repository } from 'typeorm';
import { DisputeCase } from '../entities/dispute-case.entity';
import { DisputeEvidence } from '../entities/dispute-evidence.entity';
import { DisputeEvent } from '../entities/dispute-event.entity';
import { RefundRequest } from '../entities/refund-request.entity';
import { DisputeStatus, RefundStatus } from 'src/disputes/dispute.enums';

@Injectable()
export class DisputeRepository {
  constructor(
    @InjectRepository(DisputeCase)
    private readonly disputes: Repository<DisputeCase>,
    @InjectRepository(DisputeEvidence)
    private readonly evidence: Repository<DisputeEvidence>,
    @InjectRepository(DisputeEvent)
    private readonly events: Repository<DisputeEvent>,
    @InjectRepository(RefundRequest)
    private readonly refunds: Repository<RefundRequest>,
  ) {}

  findDisputeByIdempotency(userId: string, idempotencyKey: string) {
    return this.disputes.findOne({ where: { userId, idempotencyKey } });
  }

  findDisputeForUser(userId: string, id: string) {
    return this.disputes.findOne({ where: { userId, id } });
  }

  findDispute(id: string) {
    return this.disputes.findOne({ where: { id } });
  }

  findActiveDispute(userId: string, transactionId: string) {
    return this.disputes.findOne({
      where: {
        userId,
        transactionId,
        status: Not(DisputeStatus.WITHDRAWN),
      },
      order: { createdAt: 'DESC' },
    });
  }

  findDisputes(userId?: string) {
    return this.disputes.find({
      where: userId ? { userId } : {},
      order: { createdAt: 'DESC' },
      take: userId ? undefined : 250,
    });
  }

  createDispute(input: DeepPartial<DisputeCase>) {
    return this.disputes.save(this.disputes.create(input));
  }

  updateDispute(id: string, input: DeepPartial<DisputeCase>) {
    return this.disputes.save(this.disputes.create({ id, ...input }));
  }

  findEvidence(userId: string, disputeId: string) {
    return this.evidence.find({
      where: { userId, disputeId },
      order: { createdAt: 'DESC' },
    });
  }

  findEvidenceByChecksum(disputeId: string, checksumSha256: string) {
    return this.evidence.findOne({ where: { disputeId, checksumSha256 } });
  }

  createEvidence(input: DeepPartial<DisputeEvidence>) {
    return this.evidence.save(this.evidence.create(input));
  }

  findEvents(userId: string, disputeId: string) {
    return this.events.find({
      where: { userId, disputeId },
      order: { createdAt: 'ASC' },
    });
  }

  findEventByProviderId(providerEventId: string) {
    return this.events.findOne({ where: { providerEventId } });
  }

  createEvent(input: DeepPartial<DisputeEvent>) {
    return this.events.save(this.events.create(input));
  }

  findRefundByIdempotency(userId: string, idempotencyKey: string) {
    return this.refunds.findOne({ where: { userId, idempotencyKey } });
  }

  findRefundForUser(userId: string, id: string) {
    return this.refunds.findOne({ where: { userId, id } });
  }

  findRefund(id: string) {
    return this.refunds.findOne({ where: { id } });
  }

  findOpenRefund(userId: string, transactionId: string) {
    return this.refunds.findOne({
      where: {
        userId,
        transactionId,
        status: Not(RefundStatus.CANCELLED),
      },
      order: { createdAt: 'DESC' },
    });
  }

  findRefunds(userId?: string) {
    return this.refunds.find({
      where: userId ? { userId } : {},
      order: { createdAt: 'DESC' },
      take: userId ? undefined : 250,
    });
  }

  createRefund(input: DeepPartial<RefundRequest>) {
    return this.refunds.save(this.refunds.create(input));
  }

  updateRefund(id: string, input: DeepPartial<RefundRequest>) {
    return this.refunds.save(this.refunds.create({ id, ...input }));
  }
}
