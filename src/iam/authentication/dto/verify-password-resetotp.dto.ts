import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyPasswordResetOtpDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  otp: string;
}
