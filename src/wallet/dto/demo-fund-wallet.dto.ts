import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';
import { Currency } from 'src/utils/enums/wallet.enum';

export class DemoFundWalletDto {
  @IsEnum(Currency)
  @IsNotEmpty()
  currency: Currency;

  @IsNumber()
  @IsPositive()
  @Min(1)
  amount: number;

  @IsString()
  @IsOptional()
  note?: string;
}
