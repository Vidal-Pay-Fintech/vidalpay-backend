import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthenticationService } from 'src/iam/authentication/authentication.service';
import { PaymentSchedule } from 'src/database/entities/payment-schedule.entity';
import { PaymentScheduleRepository } from 'src/database/repositories/payment-schedule.repository';
import { WalletService } from 'src/wallet/wallet.service';
import { CreatePaymentScheduleDto } from './dto/scheduled-payment.dto';
import {
  PaymentScheduleStatus,
  ScheduledExecutionStatus,
  ScheduledTransferType,
  ScheduleFrequency,
} from './scheduled-payment.enums';

const AUTHORIZATION_VERSION = 'scheduled-transfer-v1';
const MAX_ATTEMPTS = 3;

@Injectable()
export class ScheduledPaymentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScheduledPaymentService.name);
  private workerTimer?: NodeJS.Timeout;
  private workerBusy = false;

  constructor(
    private readonly repository: PaymentScheduleRepository,
    private readonly authenticationService: AuthenticationService,
    private readonly walletService: WalletService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (this.config.get('SCHEDULED_PAYMENT_WORKER_ENABLED') !== 'true') return;
    const interval = Math.max(
      15_000,
      Number(this.config.get('SCHEDULED_PAYMENT_WORKER_INTERVAL_MS') ?? 60_000),
    );
    this.workerTimer = setInterval(() => void this.runWorker(), interval);
    this.workerTimer.unref();
    void this.runWorker();
  }

  onModuleDestroy() {
    if (this.workerTimer) clearInterval(this.workerTimer);
  }

  list(userId: string) {
    return this.repository.findUserSchedules(userId);
  }

  async get(userId: string, scheduleId: string) {
    const schedule = await this.requireSchedule(userId, scheduleId);
    const executions = await this.repository.findExecutions(userId, scheduleId);
    return { schedule, executions };
  }

  async create(userId: string, dto: CreatePaymentScheduleDto) {
    const replay = await this.repository.findByIdempotency(
      userId,
      dto.idempotencyKey,
    );
    if (replay) return replay;
    this.validateSchedule(dto);
    await this.authenticationService.validateTransactionPin(userId, dto.pin);
    return this.repository.createSchedule({
      userId,
      idempotencyKey: dto.idempotencyKey,
      transferType: dto.transferType,
      amount: dto.amount.toFixed(2),
      currency: dto.currency,
      frequency: dto.frequency,
      status: PaymentScheduleStatus.ACTIVE,
      nextRunAt: dto.startAt,
      lastRunAt: null,
      endAt: dto.endAt ?? null,
      maxOccurrences:
        dto.frequency === ScheduleFrequency.ONCE
          ? 1
          : (dto.maxOccurrences ?? null),
      completedOccurrences: 0,
      destination: this.buildDestination(dto),
      authorizationVersion: AUTHORIZATION_VERSION,
      authorizedAt: new Date(),
      lockToken: null,
      lockedUntil: null,
    });
  }

  async pause(userId: string, scheduleId: string) {
    const schedule = await this.requireMutableSchedule(userId, scheduleId);
    if (schedule.status === PaymentScheduleStatus.PAUSED) return schedule;
    return this.repository.updateSchedule(schedule.id, {
      status: PaymentScheduleStatus.PAUSED,
      lockToken: null,
      lockedUntil: null,
    });
  }

  async resume(userId: string, scheduleId: string) {
    const schedule = await this.requireMutableSchedule(userId, scheduleId);
    if (schedule.status === PaymentScheduleStatus.ACTIVE) return schedule;
    return this.repository.updateSchedule(schedule.id, {
      status: PaymentScheduleStatus.ACTIVE,
      lockToken: null,
      lockedUntil: null,
    });
  }

  async cancel(userId: string, scheduleId: string) {
    const schedule = await this.requireMutableSchedule(userId, scheduleId);
    return this.repository.updateSchedule(schedule.id, {
      status: PaymentScheduleStatus.CANCELLED,
      lockToken: null,
      lockedUntil: null,
    });
  }

  async processDue() {
    const schedules = await this.repository.claimDue(new Date());
    const results: unknown[] = [];
    for (const schedule of schedules) {
      results.push(await this.executeClaimed(schedule));
    }
    return { claimed: schedules.length, results };
  }

  private async runWorker() {
    if (this.workerBusy) return;
    this.workerBusy = true;
    try {
      await this.processDue();
    } catch (error) {
      this.logger.error(
        `Scheduled payment worker failed: ${this.safeMessage(error)}`,
      );
    } finally {
      this.workerBusy = false;
    }
  }

  private async executeClaimed(schedule: PaymentSchedule) {
    const scheduledFor = schedule.nextRunAt;
    let execution = await this.repository.findExecution(
      schedule.id,
      scheduledFor,
    );
    if (execution?.status === ScheduledExecutionStatus.COMPLETED) {
      return execution;
    }
    if (execution?.status === ScheduledExecutionStatus.PROCESSING) {
      const ambiguous = await this.repository.updateExecution(execution.id, {
        status: ScheduledExecutionStatus.FAILED,
        failureReason:
          'Previous execution ended ambiguously and requires reconciliation before retry.',
      });
      await this.repository.updateSchedule(schedule.id, {
        status: PaymentScheduleStatus.PAUSED,
        lockToken: null,
        lockedUntil: null,
      });
      return ambiguous;
    }
    const attempts = (execution?.attempts ?? 0) + 1;
    execution = execution
      ? await this.repository.updateExecution(execution.id, {
          status: ScheduledExecutionStatus.PROCESSING,
          attempts,
          failureReason: null,
        })
      : await this.repository.createExecution({
          userId: schedule.userId,
          scheduleId: schedule.id,
          scheduledFor,
          status: ScheduledExecutionStatus.PROCESSING,
          attempts,
          transactionReference: null,
          completedAt: null,
          failureReason: null,
          responsePayload: null,
        });

    try {
      const response = await this.executeTransfer(schedule, execution.id);
      const reference = this.pickReference(response);
      const completed = await this.repository.updateExecution(execution.id, {
        status: ScheduledExecutionStatus.COMPLETED,
        transactionReference: reference,
        completedAt: new Date(),
        responsePayload: this.safePayload(response),
      });
      const completedOccurrences = schedule.completedOccurrences + 1;
      const nextRunAt = this.nextOccurrence(schedule, scheduledFor);
      const complete = this.shouldComplete(
        schedule,
        completedOccurrences,
        nextRunAt,
      );
      await this.repository.updateSchedule(schedule.id, {
        completedOccurrences,
        lastRunAt: new Date(),
        nextRunAt: nextRunAt ?? scheduledFor,
        status: complete
          ? PaymentScheduleStatus.COMPLETED
          : PaymentScheduleStatus.ACTIVE,
        lockToken: null,
        lockedUntil: null,
      });
      return completed;
    } catch (error) {
      const failed = await this.repository.updateExecution(execution.id, {
        status: ScheduledExecutionStatus.FAILED,
        failureReason: this.safeMessage(error),
      });
      const exhausted = attempts >= MAX_ATTEMPTS;
      await this.repository.updateSchedule(schedule.id, {
        status: exhausted
          ? PaymentScheduleStatus.PAUSED
          : PaymentScheduleStatus.ACTIVE,
        lockToken: null,
        lockedUntil: exhausted ? null : this.retryAt(attempts),
      });
      return failed;
    }
  }

  private executeTransfer(schedule: PaymentSchedule, executionId: string) {
    const destination = schedule.destination ?? {};
    const authorization = {
      scheduleId: schedule.id,
      authorizedAt: schedule.authorizedAt,
    };
    if (schedule.transferType === ScheduledTransferType.INTERNAL_TAG) {
      return this.walletService.internalTransfer(
        {
          amount: Number(schedule.amount),
          currency: schedule.currency as any,
          recipientTag: String(destination.recipientTag),
          note: destination.note ? String(destination.note) : undefined,
          pin: '0000',
        },
        schedule.userId,
        authorization,
      );
    }
    throw new ServiceUnavailableException(
      `External scheduled transfer ${executionId} requires a provider adapter with certified idempotency.`,
    );
  }

  private validateSchedule(dto: CreatePaymentScheduleDto) {
    const now = new Date();
    if (dto.startAt.getTime() < now.getTime() - 30_000) {
      throw new BadRequestException('startAt cannot be in the past.');
    }
    if (dto.endAt && dto.endAt <= dto.startAt) {
      throw new BadRequestException('endAt must be after startAt.');
    }
    if (
      dto.frequency === ScheduleFrequency.ONCE &&
      dto.maxOccurrences &&
      dto.maxOccurrences !== 1
    ) {
      throw new BadRequestException('A one-time schedule can run only once.');
    }
    if (
      dto.transferType === ScheduledTransferType.INTERNAL_TAG &&
      !dto.recipientTag?.trim()
    ) {
      throw new BadRequestException('recipientTag is required.');
    }
    if (
      dto.transferType === ScheduledTransferType.EXTERNAL_BANK &&
      !dto.destinationAccountNumber?.trim()
    ) {
      throw new BadRequestException('destinationAccountNumber is required.');
    }
  }

  private buildDestination(dto: CreatePaymentScheduleDto) {
    if (dto.transferType === ScheduledTransferType.INTERNAL_TAG) {
      return {
        recipientTag: dto.recipientTag?.trim(),
        note: dto.note?.trim() ?? null,
      };
    }
    return {
      destinationAccountNumber: dto.destinationAccountNumber?.trim(),
      destinationAccountName: dto.destinationAccountName?.trim() ?? null,
      destinationBankName: dto.destinationBankName?.trim() ?? null,
      destinationBankCode: dto.destinationBankCode?.trim() ?? null,
      destinationRoutingNumber: dto.destinationRoutingNumber?.trim() ?? null,
      note: dto.note?.trim() ?? null,
      metadata: dto.metadata ?? null,
      saveBeneficiary: dto.saveBeneficiary ?? true,
    };
  }

  private nextOccurrence(schedule: PaymentSchedule, from: Date) {
    if (schedule.frequency === ScheduleFrequency.ONCE) return null;
    const next = new Date(from);
    if (schedule.frequency === ScheduleFrequency.DAILY)
      next.setUTCDate(next.getUTCDate() + 1);
    if (schedule.frequency === ScheduleFrequency.WEEKLY)
      next.setUTCDate(next.getUTCDate() + 7);
    if (schedule.frequency === ScheduleFrequency.MONTHLY) {
      const day = next.getUTCDate();
      next.setUTCDate(1);
      next.setUTCMonth(next.getUTCMonth() + 1);
      const lastDay = new Date(
        Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
      ).getUTCDate();
      next.setUTCDate(Math.min(day, lastDay));
    }
    return next;
  }

  private shouldComplete(
    schedule: PaymentSchedule,
    completedOccurrences: number,
    nextRunAt: Date | null,
  ) {
    if (!nextRunAt) return true;
    if (
      schedule.maxOccurrences &&
      completedOccurrences >= schedule.maxOccurrences
    )
      return true;
    return Boolean(schedule.endAt && nextRunAt > schedule.endAt);
  }

  private retryAt(attempt: number) {
    const delays = [5, 15, 60];
    return new Date(
      Date.now() + delays[Math.min(attempt - 1, delays.length - 1)] * 60_000,
    );
  }

  private async requireSchedule(userId: string, scheduleId: string) {
    const schedule = await this.repository.findForUser(userId, scheduleId);
    if (!schedule) throw new NotFoundException('Payment schedule not found.');
    return schedule;
  }

  private async requireMutableSchedule(userId: string, scheduleId: string) {
    const schedule = await this.requireSchedule(userId, scheduleId);
    if (
      [
        PaymentScheduleStatus.CANCELLED,
        PaymentScheduleStatus.COMPLETED,
      ].includes(schedule.status)
    ) {
      throw new ConflictException('This payment schedule is closed.');
    }
    return schedule;
  }

  private pickReference(response: any): string | null {
    return response?.reference ?? response?.transaction?.reference ?? null;
  }

  private safePayload(response: unknown) {
    if (!response || typeof response !== 'object') return null;
    const value = response as Record<string, unknown>;
    return {
      status: value.status ?? null,
      reference: value.reference ?? null,
      transferStatus: value.transferStatus ?? null,
    };
  }

  private safeMessage(error: unknown) {
    return error instanceof Error
      ? error.message.slice(0, 1000)
      : 'Scheduled transfer failed.';
  }
}
