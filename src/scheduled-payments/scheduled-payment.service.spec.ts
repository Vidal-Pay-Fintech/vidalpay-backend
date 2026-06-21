import { ScheduledPaymentService } from './scheduled-payment.service';
import {
  PaymentScheduleStatus,
  ScheduledExecutionStatus,
  ScheduledTransferType,
  ScheduleFrequency,
} from './scheduled-payment.enums';
import { Currency } from 'src/utils/enums/wallet.enum';

describe('ScheduledPaymentService', () => {
  let service: ScheduledPaymentService;
  let repository: any;
  let authentication: any;
  let wallet: any;

  const dueSchedule = {
    id: 'schedule-1',
    userId: 'user-1',
    transferType: ScheduledTransferType.INTERNAL_TAG,
    amount: '100.00',
    currency: Currency.NGN,
    frequency: ScheduleFrequency.ONCE,
    status: PaymentScheduleStatus.ACTIVE,
    nextRunAt: new Date('2026-06-21T10:00:00.000Z'),
    lastRunAt: null,
    endAt: null,
    maxOccurrences: 1,
    completedOccurrences: 0,
    destination: { recipientTag: 'recipient', note: 'Rent' },
    authorizationVersion: 'scheduled-transfer-v1',
    authorizedAt: new Date('2026-06-20T10:00:00.000Z'),
  };

  beforeEach(() => {
    repository = {
      findByIdempotency: jest.fn(),
      createSchedule: jest.fn((value) => ({ id: 'schedule-1', ...value })),
      claimDue: jest.fn().mockResolvedValue([]),
      findExecution: jest.fn(),
      createExecution: jest.fn((value) => ({ id: 'execution-1', ...value })),
      updateExecution: jest.fn((id, value) => ({ id, ...value })),
      updateSchedule: jest.fn((id, value) => ({ id, ...value })),
    };
    authentication = {
      validateTransactionPin: jest.fn().mockResolvedValue(true),
    };
    wallet = {
      internalTransfer: jest.fn().mockResolvedValue({ reference: 'TX-1' }),
    };
    service = new ScheduledPaymentService(repository, authentication, wallet, {
      get: jest.fn(),
    } as any);
  });

  it('authorizes a schedule without persisting its transaction PIN', async () => {
    const result = await service.create('user-1', {
      idempotencyKey: 'schedule-key',
      transferType: ScheduledTransferType.INTERNAL_TAG,
      amount: 100,
      currency: Currency.NGN,
      frequency: ScheduleFrequency.MONTHLY,
      startAt: new Date(Date.now() + 60_000),
      recipientTag: 'recipient',
      pin: '1234',
    });

    expect(authentication.validateTransactionPin).toHaveBeenCalledWith(
      'user-1',
      '1234',
    );
    expect(repository.createSchedule).toHaveBeenCalledWith(
      expect.not.objectContaining({ pin: expect.anything() }),
    );
    expect(result.authorizationVersion).toBe('scheduled-transfer-v1');
  });

  it('executes and completes a one-time internal transfer', async () => {
    repository.claimDue.mockResolvedValue([dueSchedule]);
    const result = await service.processDue();

    expect(result.claimed).toBe(1);
    expect(wallet.internalTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ recipientTag: 'recipient', amount: 100 }),
      'user-1',
      expect.objectContaining({ scheduleId: 'schedule-1' }),
    );
    expect(repository.updateExecution).toHaveBeenCalledWith(
      'execution-1',
      expect.objectContaining({
        status: ScheduledExecutionStatus.COMPLETED,
        transactionReference: 'TX-1',
      }),
    );
    expect(repository.updateSchedule).toHaveBeenCalledWith(
      'schedule-1',
      expect.objectContaining({ status: PaymentScheduleStatus.COMPLETED }),
    );
  });

  it('pauses an occurrence left processing by a crashed worker', async () => {
    repository.claimDue.mockResolvedValue([dueSchedule]);
    repository.findExecution.mockResolvedValue({
      id: 'execution-1',
      status: ScheduledExecutionStatus.PROCESSING,
      attempts: 1,
    });

    await service.processDue();

    expect(wallet.internalTransfer).not.toHaveBeenCalled();
    expect(repository.updateSchedule).toHaveBeenCalledWith(
      'schedule-1',
      expect.objectContaining({ status: PaymentScheduleStatus.PAUSED }),
    );
  });

  it('fails external execution closed until provider idempotency is certified', async () => {
    repository.claimDue.mockResolvedValue([
      { ...dueSchedule, transferType: ScheduledTransferType.EXTERNAL_BANK },
    ]);

    const result = await service.processDue();

    expect((result.results[0] as any).status).toBe(
      ScheduledExecutionStatus.FAILED,
    );
    expect(repository.updateSchedule).toHaveBeenCalledWith(
      'schedule-1',
      expect.objectContaining({ status: PaymentScheduleStatus.ACTIVE }),
    );
  });

  it('clamps monthly recurrence to the final day of shorter months', () => {
    const next = (service as any).nextOccurrence(
      { frequency: ScheduleFrequency.MONTHLY },
      new Date('2026-01-31T12:00:00.000Z'),
    );
    expect(next.toISOString()).toBe('2026-02-28T12:00:00.000Z');
  });
});
