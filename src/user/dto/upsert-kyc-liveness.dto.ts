import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class UpsertKycLivenessDto {
  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  providerReference?: string;

  @IsOptional()
  @IsString()
  outcome?: string;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
