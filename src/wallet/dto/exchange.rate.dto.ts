import { IsEnum, IsNotEmpty } from 'class-validator';
import { Currency } from 'src/utils/enums/wallet.enum';

export class ExchangeRangeDto {
  @IsEnum(Currency)
  @IsNotEmpty()
  fromCurrency: Currency;

  @IsEnum(Currency)
  @IsNotEmpty()
  toCurrency: Currency;
}
