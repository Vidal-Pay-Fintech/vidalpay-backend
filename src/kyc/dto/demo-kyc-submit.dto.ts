import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum DemoKycStatus {
  NOT_STARTED = 'NOT_STARTED',
  PENDING = 'PENDING',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  RESUBMISSION_REQUIRED = 'RESUBMISSION_REQUIRED',
}

export class DemoKycSubmitDto {
  @IsEnum(DemoKycStatus)
  @IsOptional()
  status?: DemoKycStatus;

  @IsString()
  @IsOptional()
  countryCode?: string;

  @IsString()
  @IsOptional()
  note?: string;
}
