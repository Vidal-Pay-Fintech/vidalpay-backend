import { IsEmail, IsNotEmpty } from 'class-validator';

export class ResetPasswordLinkDto {
  @IsNotEmpty()
  @IsEmail()
  email: string;
}
