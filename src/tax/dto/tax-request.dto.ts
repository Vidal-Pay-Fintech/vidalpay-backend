import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TaxDocumentType } from '../tax.enums';

export class TaxIdempotentDto {
  @IsString()
  @Length(8, 100)
  idempotencyKey: string;
}

export class CreateTaxFilingDto extends TaxIdempotentDto {
  @IsInt()
  @Min(2000)
  @Max(new Date().getUTCFullYear())
  taxYear: number;
}

export class RegisterTaxDocumentDto extends TaxIdempotentDto {
  @IsEnum(TaxDocumentType)
  type: TaxDocumentType;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  originalFileName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  mimeType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  sizeBytes?: string;
}
