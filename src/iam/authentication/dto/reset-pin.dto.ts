import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class ResetTransactionPinDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}$/, {
    message: 'Transaction PIN must be a 4-digit number',
  })
  pin: string;
}
