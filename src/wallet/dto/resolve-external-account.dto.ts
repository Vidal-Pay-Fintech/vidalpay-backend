import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Currency } from 'src/utils/enums/wallet.enum';

export class ResolveExternalAccountDto {
  @IsEnum(Currency)
  currency: Currency;

  @IsString()
  @IsNotEmpty()
  destinationAccountNumber: string;

  @IsOptional()
  @IsString()
  destinationBankCode?: string;

  @IsOptional()
  @IsString()
  destinationBankName?: string;
}
