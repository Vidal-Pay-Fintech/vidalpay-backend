import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Currency } from 'src/utils/enums/wallet.enum';

export class InternalTransferDto {
  @IsNumber()
  @IsNotEmpty()
  @IsPositive()
  @Min(50)
  amount: number;

  @IsString()
  recipientTag: string;

  @IsString()
  pin: string;

  @IsEnum(Currency)
  @IsNotEmpty()
  currency: Currency;
}
