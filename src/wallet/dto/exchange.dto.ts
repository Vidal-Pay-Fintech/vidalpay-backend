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

export class ExchangeDto {
  @IsNumber()
  @IsNotEmpty()
  @IsPositive()
  @Min(1)
  amount: number;

  @IsEnum(Currency)
  @IsNotEmpty()
  fromCurrency: Currency;

  @IsEnum(Currency)
  @IsNotEmpty()
  toCurrency: Currency;
}
