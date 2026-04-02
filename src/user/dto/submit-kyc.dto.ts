import { IsOptional, IsString } from 'class-validator';

export class SubmitKycDto {
  @IsOptional()
  @IsString()
  note?: string;
}
