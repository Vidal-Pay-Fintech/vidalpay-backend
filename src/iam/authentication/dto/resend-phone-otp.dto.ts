import { Matches } from 'class-validator';

export class ResendPhoneOtpDto {
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'phoneNumber must be a valid phone number',
  })
  phone: string;
}
