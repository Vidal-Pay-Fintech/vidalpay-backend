export enum WebhookProvider {
  PAYSTACK = 'PAYSTACK',
}

export enum WebhookLogsStatus {
  SUCCESSFUL = 'SUCCESSFUL',
  FAILED = 'FAILED',
  PROCESSING = 'PROCESSING',
}

export enum PaystackEventType {
  CHARGE_SUCCESS = 'charge.success',
  DVA_SUCCESS = 'dedicatedaccount.assign.success',
  DVA_FAILED = 'dedicatedaccount.assign.failed',
  BANK_TRANSFER_SUCCESS = 'transfer.success',
  BANK_TRANSFER_FAILED = 'transfer.failed',
  BANK_TRANSFER_REVERSED = 'transfer.reversed',
}
