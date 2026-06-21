export enum PushPlatform {
  IOS = 'IOS',
  ANDROID = 'ANDROID',
  WEB = 'WEB',
}

export enum PushDeliveryStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

export enum NotificationTopic {
  SECURITY = 'SECURITY',
  TRANSACTIONS = 'TRANSACTIONS',
  PRODUCT = 'PRODUCT',
  MARKETING = 'MARKETING',
}
