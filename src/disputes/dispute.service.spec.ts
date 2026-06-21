import { BadRequestException, ConflictException } from '@nestjs/common';
import { DisputeService } from './dispute.service';
import {
  DisputeKind,
  DisputeReason,
  DisputeStatus,
  RefundStatus,
} from './dispute.enums';
import { TransactionType } from 'src/utils/enums/transaction-type.enum';

describe('DisputeService', () => {
  let service: DisputeService;
  let repository: any;
  let transactions: any;
  let gateway: any;

  const transaction = {
    id: 'transaction-1',
    userId: 'user-1',
    reference: 'txn-ref',
    type: TransactionType.DEBIT,
    amount: 100,
    currency: 'USD',
    createdAt: new Date(),
  };

  beforeEach(() => {
    repository = {
      findDisputeByIdempotency: jest.fn(),
      findActiveDispute: jest.fn(),
      createDispute: jest.fn((value) => ({ id: 'dispute-1', ...value })),
      updateDispute: jest.fn((id, value) => ({
        id,
        userId: 'user-1',
        ...value,
      })),
      createEvent: jest.fn((value) => value),
      findEventByProviderId: jest.fn(),
      findDispute: jest.fn(),
      findRefundByIdempotency: jest.fn(),
      findOpenRefund: jest.fn(),
      createRefund: jest.fn((value) => ({ id: 'refund-1', ...value })),
      findRefund: jest.fn(),
      updateRefund: jest.fn((id, value) => ({ id, ...value })),
    };
    transactions = {
      findUserTransactionById: jest.fn().mockResolvedValue(transaction),
    };
    gateway = {
      execute: jest.fn().mockRejectedValue(new Error('not connected')),
    };
    service = new DisputeService(repository, transactions, gateway);
  });

  it('stores a customer dispute safely when no provider is connected', async () => {
    const result = await service.createDispute('user-1', {
      idempotencyKey: 'unique-key',
      transactionId: transaction.id,
      reason: DisputeReason.UNRECOGNIZED,
      description: 'I do not recognize this transaction at all.',
      disputedAmount: '25.00',
      attestation: true,
    });

    expect(result.status).toBe(DisputeStatus.PENDING_PROVIDER);
    expect(repository.createEvent).toHaveBeenCalled();
    expect(gateway.execute).toHaveBeenCalled();
  });

  it('rejects a dispute amount greater than the transaction', async () => {
    await expect(
      service.createDispute('user-1', {
        idempotencyKey: 'unique-key',
        transactionId: transaction.id,
        reason: DisputeReason.INCORRECT_AMOUNT,
        description: 'The amount charged was not the amount agreed.',
        disputedAmount: '100.01',
        attestation: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('prevents a duplicate active dispute', async () => {
    repository.findActiveDispute.mockResolvedValue({
      status: DisputeStatus.UNDER_REVIEW,
    });
    await expect(
      service.createDispute('user-1', {
        idempotencyKey: 'unique-key',
        transactionId: transaction.id,
        reason: DisputeReason.OTHER,
        description: 'There is a material problem with this transaction.',
        disputedAmount: '20',
        attestation: true,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates refund requests in review without crediting a wallet', async () => {
    const result = await service.createRefund('user-1', {
      idempotencyKey: 'refund-key',
      transactionId: transaction.id,
      amount: '10.00',
      reason: 'Service was cancelled before delivery.',
    });

    expect(result.status).toBe(RefundStatus.PENDING_REVIEW);
    expect(repository.updateRefund).not.toHaveBeenCalled();
  });

  it('requires provider evidence before completing a refund', async () => {
    repository.findRefund.mockResolvedValue({
      id: 'refund-1',
      status: RefundStatus.PENDING_PROVIDER,
      providerReference: null,
    });
    await expect(
      service.adminTransitionRefund(
        'refund-1',
        { status: RefundStatus.COMPLETED, note: 'Completed externally.' },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('registers provider chargebacks idempotently with an audit event', async () => {
    const result = await service.registerChargeback(
      {
        userId: 'user-1',
        transactionId: transaction.id,
        providerEventId: 'provider-event-1',
        providerCaseId: 'provider-case-1',
        reason: DisputeReason.UNRECOGNIZED,
        disputedAmount: '50',
        description: 'Provider notified Vidal Pay of a chargeback.',
      },
      'admin-1',
    );

    expect(result.kind).toBe(DisputeKind.CHARGEBACK);
    expect(result.status).toBe(DisputeStatus.UNDER_REVIEW);
    expect(repository.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({ providerEventId: 'provider-event-1' }),
    );
  });
});
