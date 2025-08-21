import { IsEmail, IsNotEmpty , IsString } from 'class-validator';

export class ResendOtpDto {
  @IsNotEmpty()
  @IsString()
  @IsEmail()
  email: string;
}
