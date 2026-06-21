import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DeepPartial, LessThanOrEqual, Repository } from 'typeorm';
import { PaymentScheduleStatus } from 'src/scheduled-payments/scheduled-payment.enums';
import { PaymentSchedule } from '../entities/payment-schedule.entity';
import { ScheduledPaymentExecution } from '../entities/scheduled-payment-execution.entity';

@Injectable()
export class PaymentScheduleRepository {
  constructor(
    @InjectRepository(PaymentSchedule)
    private readonly schedules: Repository<PaymentSchedule>,
    @InjectRepository(ScheduledPaymentExecution)
    private readonly executions: Repository<ScheduledPaymentExecution>,
  ) {}

  findByIdempotency(userId: string, idempotencyKey: string) {
    return this.schedules.findOne({ where: { userId, idempotencyKey } });
  }

  findForUser(userId: string, id: string) {
    return this.schedules
      .createQueryBuilder('schedule')
      .addSelect('schedule.destination')
      .where('schedule.id = :id AND schedule.userId = :userId', { id, userId })
      .getOne();
  }

  findUserSchedules(userId: string) {
    return this.schedules.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  createSchedule(input: DeepPartial<PaymentSchedule>) {
    return this.schedules.save(this.schedules.create(input));
  }

  updateSchedule(id: string, input: DeepPartial<PaymentSchedule>) {
    return this.schedules.save(this.schedules.create({ id, ...input }));
  }

  findExecutions(userId: string, scheduleId: string) {
    return this.executions.find({
      where: { userId, scheduleId },
      order: { scheduledFor: 'DESC' },
    });
  }

  findExecution(scheduleId: string, scheduledFor: Date) {
    return this.executions
      .createQueryBuilder('execution')
      .addSelect(['execution.failureReason', 'execution.responsePayload'])
      .where(
        'execution.scheduleId = :scheduleId AND execution.scheduledFor = :scheduledFor',
        { scheduleId, scheduledFor },
      )
      .getOne();
  }

  createExecution(input: DeepPartial<ScheduledPaymentExecution>) {
    return this.executions.save(this.executions.create(input));
  }

  updateExecution(id: string, input: DeepPartial<ScheduledPaymentExecution>) {
    return this.executions.save(this.executions.create({ id, ...input }));
  }

  async claimDue(now: Date, limit = 20, lockSeconds = 120) {
    const candidates = await this.schedules.find({
      where: {
        status: PaymentScheduleStatus.ACTIVE,
        nextRunAt: LessThanOrEqual(now),
      },
      order: { nextRunAt: 'ASC' },
      take: limit * 3,
    });
    const claimed: PaymentSchedule[] = [];
    for (const candidate of candidates) {
      if (claimed.length >= limit) break;
      const token = randomUUID();
      const lockedUntil = new Date(now.getTime() + lockSeconds * 1000);
      const result = await this.schedules
        .createQueryBuilder()
        .update(PaymentSchedule)
        .set({ lockToken: token, lockedUntil })
        .where('id = :id', { id: candidate.id })
        .andWhere('status = :status', { status: PaymentScheduleStatus.ACTIVE })
        .andWhere('nextRunAt <= :now', { now })
        .andWhere('(lockedUntil IS NULL OR lockedUntil < :now)', { now })
        .execute();
      if (!result.affected) continue;
      const schedule = await this.schedules
        .createQueryBuilder('schedule')
        .addSelect([
          'schedule.destination',
          'schedule.lockToken',
          'schedule.lockedUntil',
        ])
        .where('schedule.id = :id AND schedule.lockToken = :token', {
          id: candidate.id,
          token,
        })
        .getOne();
      if (schedule) claimed.push(schedule);
    }
    return claimed;
  }
}
