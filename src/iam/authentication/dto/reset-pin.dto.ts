import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class ResetTransactionPinDto {
  @IsNotEmpty()
  @IsString()
  pin: string;
}
