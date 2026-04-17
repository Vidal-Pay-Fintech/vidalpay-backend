import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import { BeneficiaryType } from 'src/database/entities/beneficiary.entity';
import { Currency } from 'src/utils/enums/wallet.enum';

export class CreateBeneficiaryDto {
  @IsOptional()
  @IsEnum(BeneficiaryType)
  type?: BeneficiaryType;

  @IsOptional()
  @IsString()
  beneficiaryId?: string;

  @IsOptional()
  @IsString()
  tagId?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @ValidateIf((value) => value.type === BeneficiaryType.BANK_ACCOUNT)
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ValidateIf((value) => value.type === BeneficiaryType.BANK_ACCOUNT)
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  accountName?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  routingNumber?: string;

  @IsOptional()
  @IsString()
  bankCode?: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
