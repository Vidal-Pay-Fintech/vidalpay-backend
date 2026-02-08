import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class CreateTransactionPinDto {
  @IsNotEmpty()
  @IsString()
  pin: string;
}
