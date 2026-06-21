import { IsEnum, IsString, IsUUID, Length, Matches } from 'class-validator';
import { InvestmentOrderType } from '../investment.enums';

const POSITIVE_DECIMAL = /^(?!0+(?:\.0+)?$)\d+(?:\.\d{1,18})?$/;

export class InvestmentIdempotentDto {
  @IsString()
  @Length(8, 100)
  idempotencyKey: string;
}

export class CreateInvestmentOrderDto extends InvestmentIdempotentDto {
  @IsUUID()
  productId: string;

  @IsEnum(InvestmentOrderType)
  type: InvestmentOrderType;

  @IsString()
  @Matches(POSITIVE_DECIMAL, {
    message: 'amount must be a positive decimal string with up to 18 decimals',
  })
  amount: string;
}

export class InvestmentFundingDto extends InvestmentIdempotentDto {
  @IsString()
  @Matches(POSITIVE_DECIMAL, {
    message: 'amount must be a positive decimal string with up to 18 decimals',
  })
  amount: string;
}
