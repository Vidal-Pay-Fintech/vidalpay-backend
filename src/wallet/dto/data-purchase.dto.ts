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

export class DataPurchaseDto {
  @IsNumber()
  @IsPositive()
  @Min(50)
  amount: number;

  @IsEnum(Currency)
  currency: Currency;

  @Matches(/^\+?[1-9]\d{1,14}$/)
  phoneNumber: string;

  @IsString()
  @IsNotEmpty()
  serviceCode: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
