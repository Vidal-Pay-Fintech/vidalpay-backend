export enum CryptoAsset {
  BTC = 'BTC',
  ETH = 'ETH',
  USDT = 'USDT',
}

export enum CryptoAccountStatus {
  PENDING_KYC = 'PENDING_KYC',
  PENDING_PROVIDER = 'PENDING_PROVIDER',
  ACTIVE = 'ACTIVE',
  RESTRICTED = 'RESTRICTED',
  CLOSED = 'CLOSED',
}

export enum CryptoOrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum CryptoOrderType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
}

export enum CryptoOrderStatus {
  SUBMITTED = 'SUBMITTED',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  FILLED = 'FILLED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED',
}

export enum CryptoTransferType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
}

export enum CryptoTransferStatus {
  PENDING = 'PENDING',
  CONFIRMING = 'CONFIRMING',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED',
}

export enum CryptoStakingStatus {
  SUBMITTED = 'SUBMITTED',
  ACTIVE = 'ACTIVE',
  UNSTAKING = 'UNSTAKING',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED',
}
