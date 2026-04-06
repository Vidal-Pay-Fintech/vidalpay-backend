import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { Currency } from 'src/utils/enums/wallet.enum';

export class UtilityPaymentDto {
  @IsNumber()
  @IsPositive()
  @Min(50)
  amount: number;

  @IsEnum(Currency)
  currency: Currency;

  @IsString()
  @IsNotEmpty()
  serviceCode: string;

  @IsString()
  @IsNotEmpty()
  customerReference: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
