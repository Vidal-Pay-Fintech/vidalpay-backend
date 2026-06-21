import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { Currency } from 'src/utils/enums/wallet.enum';
import {
  ScheduleFrequency,
  ScheduledTransferType,
} from '../scheduled-payment.enums';

export class CreatePaymentScheduleDto {
  @IsString()
  @Length(8, 100)
  idempotencyKey: string;

  @IsEnum(ScheduledTransferType)
  transferType: ScheduledTransferType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Min(50)
  amount: number;

  @IsEnum(Currency)
  currency: Currency;

  @IsEnum(ScheduleFrequency)
  frequency: ScheduleFrequency;

  @Type(() => Date)
  @IsDate()
  startAt: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endAt?: Date;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxOccurrences?: number;

  @ValidateIf((dto) => dto.transferType === ScheduledTransferType.INTERNAL_TAG)
  @IsString()
  @Length(2, 100)
  recipientTag?: string;

  @ValidateIf((dto) => dto.transferType === ScheduledTransferType.EXTERNAL_BANK)
  @IsString()
  @Length(3, 100)
  destinationAccountNumber?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  destinationAccountName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  destinationBankName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  destinationBankCode?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  destinationRoutingNumber?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  note?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  saveBeneficiary?: boolean;

  @IsString()
  @Matches(/^\d{4}$/, { message: 'Transaction PIN must be a 4-digit number' })
  pin: string;
}
