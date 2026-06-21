import {
  Equals,
  IsEnum,
  IsInt,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { LoanPurpose } from '../loan.enums';

const POSITIVE_DECIMAL = /^(?!0+(?:\.0+)?$)\d+(?:\.\d{1,18})?$/;

export class LoanIdempotentDto {
  @IsString()
  @Length(8, 100)
  idempotencyKey: string;
}

export class RequestLoanEligibilityDto extends LoanIdempotentDto {
  @Equals(true, {
    message: 'consentToCreditCheck must be explicitly accepted',
  })
  consentToCreditCheck: true;
}

export class CreateLoanApplicationDto extends LoanIdempotentDto {
  @IsString()
  @Matches(POSITIVE_DECIMAL, {
    message: 'requestedAmount must be a positive decimal string',
  })
  requestedAmount: string;

  @IsInt()
  @Min(1)
  @Max(60)
  requestedTermMonths: number;

  @IsEnum(LoanPurpose)
  purpose: LoanPurpose;

  @Equals(true, {
    message: 'consentToLoanApplication must be explicitly accepted',
  })
  consentToLoanApplication: true;
}

export class CreateLoanRepaymentDto extends LoanIdempotentDto {
  @IsString()
  @Matches(POSITIVE_DECIMAL, {
    message: 'amount must be a positive decimal string',
  })
  amount: string;
}
