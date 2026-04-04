import { Optional } from '@nestjs/common';
import {
  IsAlpha,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsStrongPassword,
  Matches,
  MinLength,
} from 'class-validator';

export class SignUpDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @MinLength(8)
  @IsString()
  @IsStrongPassword()
  password: string;

  @IsAlpha()
  @MinLength(2)
  firstName: string;

  @IsAlpha()
  @MinLength(2)
  lastName: string;

  @IsOptional()
  @MinLength(4)
  @IsString()
  pin: string;

  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Invalid phone format',
  })
  phoneNumber: string;
}
