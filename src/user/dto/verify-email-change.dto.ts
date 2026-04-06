import { IsString, Matches } from 'class-validator';

export class VerifyEmailChangeDto {
  @IsString()
  @Matches(/^\d{6}$/, {
    message: 'Verification code must be a 6-digit number',
  })
  token: string;
}
