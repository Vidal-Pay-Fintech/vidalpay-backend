import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class DeactivateAccountDto {
  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsString()
  @MinLength(8)
  @IsNotEmpty()
  password: string;
}
