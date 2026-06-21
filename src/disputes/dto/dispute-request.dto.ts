import {
  Equals,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  DisputeReason,
  DisputeStatus,
  EvidenceType,
  RefundStatus,
} from '../dispute.enums';

const POSITIVE_DECIMAL = /^(?!0+(?:\.0+)?$)\d+(?:\.\d{1,18})?$/;

export class CreateDisputeDto {
  @IsString()
  @Length(8, 100)
  idempotencyKey: string;

  @IsString()
  @Length(1, 36)
  transactionId: string;

  @IsEnum(DisputeReason)
  reason: DisputeReason;

  @IsString()
  @Length(20, 2000)
  description: string;

  @IsString()
  @Matches(POSITIVE_DECIMAL)
  disputedAmount: string;

  @Equals(true, { message: 'attestation must be explicitly accepted' })
  attestation: true;
}

export class RegisterDisputeEvidenceDto {
  @IsEnum(EvidenceType)
  type: EvidenceType;

  @IsString()
  @Length(1, 255)
  storageKey: string;

  @IsString()
  @Length(64, 64)
  @Matches(/^[a-fA-F0-9]{64}$/)
  checksumSha256: string;

  @IsString()
  @Length(1, 100)
  contentType: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;
}

export class CreateRefundRequestDto {
  @IsString()
  @Length(8, 100)
  idempotencyKey: string;

  @IsString()
  @Length(1, 36)
  transactionId: string;

  @IsString()
  @Matches(POSITIVE_DECIMAL)
  amount: string;

  @IsString()
  @Length(10, 1000)
  reason: string;
}

export class AdminDisputeTransitionDto {
  @IsEnum(DisputeStatus)
  status: DisputeStatus;

  @IsString()
  @Length(3, 1000)
  note: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  providerEventId?: string;
}

export class AdminRefundTransitionDto {
  @IsEnum(RefundStatus)
  status: RefundStatus;

  @IsString()
  @Length(3, 1000)
  note: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  providerReference?: string;
}

export class RegisterChargebackDto {
  @IsString()
  @Length(1, 36)
  userId: string;

  @IsString()
  @Length(1, 36)
  transactionId: string;

  @IsString()
  @Length(8, 100)
  providerEventId: string;

  @IsString()
  @Length(1, 255)
  providerCaseId: string;

  @IsEnum(DisputeReason)
  reason: DisputeReason;

  @IsString()
  @Matches(POSITIVE_DECIMAL)
  disputedAmount: string;

  @IsString()
  @Length(3, 1000)
  description: string;
}
