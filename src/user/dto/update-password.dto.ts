import { IsString, MinLength } from 'class-validator';

export class UpdatePasswordDto {
  @MinLength(10)
  @IsString()
  password: string;

  @MinLength(10)
  @IsString()
  newPassword: string;
}
