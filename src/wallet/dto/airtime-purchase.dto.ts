import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { Currency } from 'src/utils/enums/wallet.enum';

export class AirtimePurchaseDto {
  @IsNumber()
  @IsPositive()
  @Min(50)
  amount: number;

  @IsEnum(Currency)
  currency: Currency;

  @Matches(/^\+?[1-9]\d{1,14}$/)
  phoneNumber: string;

  @IsString()
  @Matches(/^\d{4}$/, {
    message: 'Transaction PIN must be a 4-digit number',
  })
  pin: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  serviceCode?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
