import { IsEnum, IsNotEmpty, IsNumber, IsPositive, Min } from 'class-validator';
import { Currency } from 'src/utils/enums/wallet.enum';

export class FxQuoteDto {
  @IsEnum(Currency)
  @IsNotEmpty()
  sourceCurrency: Currency;

  @IsEnum(Currency)
  @IsNotEmpty()
  targetCurrency: Currency;

  @IsNumber()
  @IsPositive()
  @Min(1)
  amount: number;
}
