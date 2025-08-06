import { Optional } from '@nestjs/common';
import {
  IsAlpha,
  IsEmail,
  IsOptional,
  IsString,
  IsStrongPassword,
  Matches,
  MinLength,
} from 'class-validator';

export class SignUpDto {
  @IsOptional()
  @IsEmail()
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

  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'phoneNumber must be a valid phone number',
  })
  phoneNumber: string;
}
