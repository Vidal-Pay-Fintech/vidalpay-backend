import {
  IsEnum,
  IsNotEmpty,
  Matches,
  IsNumber,
  IsPositive,
  IsString,
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
  @Matches(/^\d{4}$/, {
    message: 'Transaction PIN must be a 4-digit number',
  })
  pin: string;

  @IsEnum(Currency)
  @IsNotEmpty()
  currency: Currency;
}
