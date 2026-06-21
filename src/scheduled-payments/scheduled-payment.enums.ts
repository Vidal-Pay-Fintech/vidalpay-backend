export enum ScheduleFrequency {
  ONCE = 'ONCE',
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
}

export enum ScheduledTransferType {
  INTERNAL_TAG = 'INTERNAL_TAG',
  EXTERNAL_BANK = 'EXTERNAL_BANK',
}

export enum PaymentScheduleStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum ScheduledExecutionStatus {
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}
