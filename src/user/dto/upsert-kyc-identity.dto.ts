import { IsObject, IsOptional, IsString } from 'class-validator';

export class UpsertKycIdentityDto {
  @IsOptional()
  @IsString()
  nin?: string;

  @IsOptional()
  @IsString()
  bvn?: string;

  @IsOptional()
  @IsString()
  ssn?: string;

  @IsOptional()
  @IsString()
  approvedIdentityType?: string;

  @IsOptional()
  @IsString()
  approvedIdentityValue?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
