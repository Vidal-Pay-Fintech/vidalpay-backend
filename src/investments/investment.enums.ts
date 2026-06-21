export enum InvestmentAccountStatus {
  PENDING_KYC = 'PENDING_KYC',
  PENDING_PROVIDER = 'PENDING_PROVIDER',
  ACTIVE = 'ACTIVE',
  RESTRICTED = 'RESTRICTED',
  CLOSED = 'CLOSED',
}

export enum InvestmentRiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum InvestmentPositionStatus {
  ACTIVE = 'ACTIVE',
  EXITING = 'EXITING',
  CLOSED = 'CLOSED',
}

export enum InvestmentOrderType {
  SUBSCRIBE = 'SUBSCRIBE',
  REDEEM = 'REDEEM',
}

export enum InvestmentOrderStatus {
  SUBMITTED = 'SUBMITTED',
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED',
}

export enum InvestmentFundingType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
}

export enum InvestmentFundingStatus {
  SUBMITTED = 'SUBMITTED',
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED',
}
