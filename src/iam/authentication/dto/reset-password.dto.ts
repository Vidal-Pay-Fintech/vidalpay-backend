import { IsOptional, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsOptional()
  @IsString()
  token: string;

  @IsString()
  @MinLength(8)
  password: string;
}
