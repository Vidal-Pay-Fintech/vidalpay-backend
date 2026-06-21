import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';
import { CryptoAsset, CryptoOrderSide, CryptoOrderType } from '../crypto.enums';

const POSITIVE_DECIMAL = /^(?!0+(?:\.0+)?$)\d+(?:\.\d{1,18})?$/;

export class CryptoIdempotentDto {
  @IsString()
  @Length(8, 100)
  idempotencyKey: string;
}

export class CreateCryptoOrderDto extends CryptoIdempotentDto {
  @IsEnum(CryptoOrderSide)
  side: CryptoOrderSide;

  @IsEnum(CryptoOrderType)
  orderType: CryptoOrderType;

  @IsEnum(CryptoAsset)
  asset: CryptoAsset;

  @IsString()
  @Matches(POSITIVE_DECIMAL, {
    message:
      'quantity must be a positive decimal string with up to 18 decimals',
  })
  quantity: string;

  @ValidateIf(
    (dto: CreateCryptoOrderDto) => dto.orderType === CryptoOrderType.LIMIT,
  )
  @IsNotEmpty()
  @IsString()
  @Matches(POSITIVE_DECIMAL, {
    message: 'limitPrice must be a positive decimal string',
  })
  limitPrice?: string;
}

export class CryptoDepositAddressDto extends CryptoIdempotentDto {
  @IsEnum(CryptoAsset)
  asset: CryptoAsset;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  network?: string;
}

export class CryptoWithdrawalDto extends CryptoIdempotentDto {
  @IsEnum(CryptoAsset)
  asset: CryptoAsset;

  @IsString()
  @Matches(POSITIVE_DECIMAL, {
    message: 'amount must be a positive decimal string with up to 18 decimals',
  })
  amount: string;

  @IsString()
  @Length(10, 255)
  address: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  network?: string;
}

export class CreateCryptoStakeDto extends CryptoIdempotentDto {
  @IsEnum(CryptoAsset)
  asset: CryptoAsset;

  @IsString()
  @Matches(POSITIVE_DECIMAL, {
    message: 'amount must be a positive decimal string with up to 18 decimals',
  })
  amount: string;
}
