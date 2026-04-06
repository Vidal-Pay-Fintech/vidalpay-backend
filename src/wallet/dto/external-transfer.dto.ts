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

export class ExternalTransferDto {
  @IsNumber()
  @IsPositive()
  @Min(50)
  amount: number;

  @IsEnum(Currency)
  currency: Currency;

  @IsString()
  @IsNotEmpty()
  destinationAccountNumber: string;

  @IsOptional()
  @IsString()
  destinationAccountName?: string;

  @IsOptional()
  @IsString()
  destinationBankName?: string;

  @IsOptional()
  @IsString()
  destinationRoutingNumber?: string;

  @IsOptional()
  @IsString()
  narration?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
