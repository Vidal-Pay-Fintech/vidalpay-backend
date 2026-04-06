import { Matches } from 'class-validator';

export class RequestPhoneChangeDto {
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Invalid phone format',
  })
  newPhoneNumber: string;
}
