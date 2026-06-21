import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DisputeCase } from 'src/database/entities/dispute-case.entity';
import { DisputeRepository } from 'src/database/repositories/dispute.repository';
import { TransactionRepository } from 'src/database/repositories/transaction.repository';
import { TransactionType } from 'src/utils/enums/transaction-type.enum';
import {
  AdminDisputeTransitionDto,
  AdminRefundTransitionDto,
  CreateDisputeDto,
  CreateRefundRequestDto,
  RegisterDisputeEvidenceDto,
  RegisterChargebackDto,
} from './dto/dispute-request.dto';
import {
  DisputeEventSource,
  DisputeKind,
  DisputeStatus,
  RefundStatus,
} from './dispute.enums';
import { DisputeProviderGateway } from './dispute-provider.gateway';

const TERMINAL_DISPUTES = new Set([
  DisputeStatus.WON,
  DisputeStatus.LOST,
  DisputeStatus.WITHDRAWN,
  DisputeStatus.EXPIRED,
]);
const TERMINAL_REFUNDS = new Set([
  RefundStatus.COMPLETED,
  RefundStatus.REJECTED,
  RefundStatus.CANCELLED,
]);
const ATTESTATION_VERSION = 'dispute-attestation-v1';
const DISPUTE_WINDOW_DAYS = 120;

@Injectable()
export class DisputeService {
  constructor(
    private readonly repository: DisputeRepository,
    private readonly transactions: TransactionRepository,
    private readonly providerGateway: DisputeProviderGateway,
  ) {}

  async getOverview(userId: string) {
    const [disputes, refunds] = await Promise.all([
      this.repository.findDisputes(userId),
      this.repository.findRefunds(userId),
    ]);
    return { disputes, refunds };
  }

  listDisputes(userId: string) {
    return this.repository.findDisputes(userId);
  }

  async getDispute(userId: string, disputeId: string) {
    const dispute = await this.requireDispute(userId, disputeId);
    const [evidence, events] = await Promise.all([
      this.repository.findEvidence(userId, disputeId),
      this.repository.findEvents(userId, disputeId),
    ]);
    return { dispute, evidence, events };
  }

  async createDispute(userId: string, dto: CreateDisputeDto) {
    const replay = await this.repository.findDisputeByIdempotency(
      userId,
      dto.idempotencyKey,
    );
    if (replay) return replay;

    const transaction = await this.transactions.findUserTransactionById(
      userId,
      dto.transactionId,
    );
    this.assertEligibleTransaction(transaction);
    this.assertAmountWithin(dto.disputedAmount, String(transaction.amount));
    const existing = await this.repository.findActiveDispute(
      userId,
      transaction.id,
    );
    if (existing && !TERMINAL_DISPUTES.has(existing.status)) {
      throw new ConflictException('An active dispute already exists.');
    }

    const dispute = await this.repository.createDispute({
      userId,
      transactionId: transaction.id,
      idempotencyKey: dto.idempotencyKey,
      kind: DisputeKind.TRANSACTION_DISPUTE,
      reason: dto.reason,
      description: dto.description,
      disputedAmount: dto.disputedAmount,
      currency: transaction.currency,
      status: DisputeStatus.PENDING_PROVIDER,
      attestationVersion: ATTESTATION_VERSION,
      attestedAt: new Date(),
      providerCaseId: null,
      providerDeadline: null,
      resolvedAt: null,
      providerPayload: null,
    });
    await this.recordEvent(dispute, null, DisputeEventSource.USER, userId);

    try {
      const result: any = await this.providerGateway.execute(
        'dispute_create',
        {
          disputeId: dispute.id,
          transactionReference: transaction.reference,
          amount: dto.disputedAmount,
          currency: transaction.currency,
          reason: dto.reason,
        },
        dto.idempotencyKey,
      );
      if (result?.providerReference) {
        const updated = await this.repository.updateDispute(dispute.id, {
          providerCaseId: result.providerReference,
          status: DisputeStatus.UNDER_REVIEW,
          providerPayload: result.data ?? null,
        });
        await this.recordEvent(
          updated,
          dispute.status,
          DisputeEventSource.PROVIDER,
          null,
          'Case accepted by the connected dispute provider.',
        );
        return updated;
      }
    } catch {
      // The locally filed case remains actionable while provider setup is pending.
    }
    return dispute;
  }

  async registerEvidence(
    userId: string,
    disputeId: string,
    dto: RegisterDisputeEvidenceDto,
  ) {
    const dispute = await this.requireDispute(userId, disputeId);
    if (TERMINAL_DISPUTES.has(dispute.status)) {
      throw new ConflictException('Evidence cannot be added to a closed case.');
    }
    const checksum = dto.checksumSha256.toLowerCase();
    const existing = await this.repository.findEvidenceByChecksum(
      disputeId,
      checksum,
    );
    if (existing) return existing;
    return this.repository.createEvidence({
      userId,
      disputeId,
      type: dto.type,
      storageKey: dto.storageKey,
      checksumSha256: checksum,
      contentType: dto.contentType,
      fileName: dto.fileName ?? null,
    });
  }

  async withdrawDispute(userId: string, disputeId: string) {
    const dispute = await this.requireDispute(userId, disputeId);
    if (TERMINAL_DISPUTES.has(dispute.status)) {
      throw new ConflictException('This dispute is already closed.');
    }
    return this.transitionDispute(
      dispute,
      DisputeStatus.WITHDRAWN,
      DisputeEventSource.USER,
      userId,
      'Withdrawn by customer',
    );
  }

  listRefunds(userId: string) {
    return this.repository.findRefunds(userId);
  }

  async getRefund(userId: string, refundId: string) {
    const refund = await this.repository.findRefundForUser(userId, refundId);
    if (!refund) throw new NotFoundException('Refund request not found.');
    return refund;
  }

  async createRefund(userId: string, dto: CreateRefundRequestDto) {
    const replay = await this.repository.findRefundByIdempotency(
      userId,
      dto.idempotencyKey,
    );
    if (replay) return replay;
    const transaction = await this.transactions.findUserTransactionById(
      userId,
      dto.transactionId,
    );
    this.assertEligibleTransaction(transaction);
    this.assertAmountWithin(dto.amount, String(transaction.amount));
    const existing = await this.repository.findOpenRefund(
      userId,
      transaction.id,
    );
    if (existing && !TERMINAL_REFUNDS.has(existing.status)) {
      throw new ConflictException('An active refund request already exists.');
    }
    return this.repository.createRefund({
      userId,
      transactionId: transaction.id,
      idempotencyKey: dto.idempotencyKey,
      amount: dto.amount,
      currency: transaction.currency,
      reason: dto.reason,
      status: RefundStatus.PENDING_REVIEW,
      providerReference: null,
      reviewedBy: null,
      reviewNote: null,
      resolvedAt: null,
      providerPayload: null,
    });
  }

  async cancelRefund(userId: string, refundId: string) {
    const refund = await this.getRefund(userId, refundId);
    if (TERMINAL_REFUNDS.has(refund.status)) {
      throw new ConflictException('This refund request is already closed.');
    }
    return this.repository.updateRefund(refund.id, {
      status: RefundStatus.CANCELLED,
      resolvedAt: new Date(),
    });
  }

  getAdminQueue() {
    return Promise.all([
      this.repository.findDisputes(),
      this.repository.findRefunds(),
    ]).then(([disputes, refunds]) => ({ disputes, refunds }));
  }

  async registerChargeback(dto: RegisterChargebackDto, actorId: string) {
    const eventReplay = await this.repository.findEventByProviderId(
      dto.providerEventId,
    );
    if (eventReplay) {
      const existing = await this.repository.findDispute(eventReplay.disputeId);
      if (existing) return existing;
    }
    const key = `chargeback:${dto.providerEventId}`;
    const replay = await this.repository.findDisputeByIdempotency(
      dto.userId,
      key,
    );
    if (replay) return replay;
    const transaction = await this.transactions.findUserTransactionById(
      dto.userId,
      dto.transactionId,
    );
    this.assertAmountWithin(dto.disputedAmount, String(transaction.amount));
    const dispute = await this.repository.createDispute({
      userId: dto.userId,
      transactionId: transaction.id,
      idempotencyKey: key,
      kind: DisputeKind.CHARGEBACK,
      reason: dto.reason,
      description: dto.description,
      disputedAmount: dto.disputedAmount,
      currency: transaction.currency,
      status: DisputeStatus.UNDER_REVIEW,
      attestationVersion: 'provider-chargeback-v1',
      attestedAt: new Date(),
      providerCaseId: dto.providerCaseId,
      providerDeadline: null,
      resolvedAt: null,
      providerPayload: null,
    });
    await this.recordEvent(
      dispute,
      null,
      DisputeEventSource.PROVIDER,
      actorId,
      'Chargeback registered from an authoritative provider event.',
      dto.providerEventId,
    );
    return dispute;
  }

  async adminTransitionDispute(
    disputeId: string,
    dto: AdminDisputeTransitionDto,
    actorId: string,
  ) {
    const dispute = await this.repository.findDispute(disputeId);
    if (!dispute) throw new NotFoundException('Dispute not found.');
    if (dto.providerEventId) {
      const replay = await this.repository.findEventByProviderId(
        dto.providerEventId,
      );
      if (replay) return dispute;
    }
    return this.transitionDispute(
      dispute,
      dto.status,
      DisputeEventSource.ADMIN,
      actorId,
      dto.note,
      dto.providerEventId,
    );
  }

  async adminTransitionRefund(
    refundId: string,
    dto: AdminRefundTransitionDto,
    actorId: string,
  ) {
    const refund = await this.repository.findRefund(refundId);
    if (!refund) throw new NotFoundException('Refund request not found.');
    if (TERMINAL_REFUNDS.has(refund.status)) {
      throw new ConflictException('This refund request is already closed.');
    }
    if (dto.status === RefundStatus.COMPLETED && !dto.providerReference) {
      throw new BadRequestException(
        'A provider reference is required to complete a refund.',
      );
    }
    const reviewed = await this.repository.updateRefund(refund.id, {
      status: dto.status,
      reviewedBy: actorId,
      reviewNote: dto.note,
      providerReference: dto.providerReference ?? refund.providerReference,
      resolvedAt: TERMINAL_REFUNDS.has(dto.status) ? new Date() : null,
    });
    if (dto.status !== RefundStatus.APPROVED) return reviewed;

    try {
      const result: any = await this.providerGateway.execute(
        'refund_create',
        {
          refundId: refund.id,
          transactionId: refund.transactionId,
          amount: refund.amount,
          currency: refund.currency,
        },
        `refund-provider:${refund.id}`,
      );
      if (!result?.providerReference) return reviewed;
      return this.repository.updateRefund(refund.id, {
        status: RefundStatus.PENDING_PROVIDER,
        providerReference: result.providerReference,
        providerPayload: result.data ?? null,
      });
    } catch {
      // Approval remains queued until a refund provider is connected.
      return reviewed;
    }
  }

  private async transitionDispute(
    dispute: DisputeCase,
    status: DisputeStatus,
    source: DisputeEventSource,
    actorId: string | null,
    note: string,
    providerEventId?: string,
  ) {
    if (TERMINAL_DISPUTES.has(dispute.status)) {
      throw new ConflictException('This dispute is already closed.');
    }
    const updated = await this.repository.updateDispute(dispute.id, {
      status,
      resolvedAt: TERMINAL_DISPUTES.has(status) ? new Date() : null,
    });
    await this.recordEvent(
      updated,
      dispute.status,
      source,
      actorId,
      note,
      providerEventId,
    );
    return updated;
  }

  private recordEvent(
    dispute: DisputeCase,
    previousStatus: DisputeStatus | null,
    source: DisputeEventSource,
    actorId: string | null,
    note: string | null = null,
    providerEventId: string | null = null,
  ) {
    return this.repository.createEvent({
      userId: dispute.userId,
      disputeId: dispute.id,
      previousStatus,
      status: dispute.status,
      source,
      actorId,
      note,
      providerEventId,
    });
  }

  private async requireDispute(userId: string, disputeId: string) {
    const dispute = await this.repository.findDisputeForUser(userId, disputeId);
    if (!dispute) throw new NotFoundException('Dispute not found.');
    return dispute;
  }

  private assertEligibleTransaction(transaction: any) {
    if (transaction.type !== TransactionType.DEBIT) {
      throw new BadRequestException('Only debit transactions can be disputed.');
    }
    const oldest = new Date();
    oldest.setUTCDate(oldest.getUTCDate() - DISPUTE_WINDOW_DAYS);
    if (new Date(transaction.createdAt) < oldest) {
      throw new BadRequestException(
        'The transaction is outside the dispute window.',
      );
    }
  }

  private assertAmountWithin(requested: string, original: string) {
    if (this.compareDecimal(requested, original) > 0) {
      throw new BadRequestException(
        'The requested amount exceeds the transaction amount.',
      );
    }
  }

  private compareDecimal(left: string, right: string) {
    const normalize = (value: string) => {
      const [whole, fraction = ''] = value.split('.');
      return { whole: whole.replace(/^0+(?=\d)/, ''), fraction };
    };
    const a = normalize(left);
    const b = normalize(right);
    if (a.whole.length !== b.whole.length)
      return a.whole.length > b.whole.length ? 1 : -1;
    if (a.whole !== b.whole) return a.whole > b.whole ? 1 : -1;
    const width = Math.max(a.fraction.length, b.fraction.length);
    const af = a.fraction.padEnd(width, '0');
    const bf = b.fraction.padEnd(width, '0');
    return af === bf ? 0 : af > bf ? 1 : -1;
  }
}
