import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Role } from 'src/common/enum/role.enum';
import NoSpecialCharacters from 'src/common/specialCharacters';

export class SignInDto {
  @ValidateIf((o) => !o.phoneNumber) // Only validate email if phoneNumber is not provided
  @IsNotEmpty({
    message: 'Email is required when phone number is not provided',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsOptional()
  email?: string;

  @ValidateIf((o) => !o.email) // Only validate phoneNumber if email is not provided
  @IsNotEmpty({
    message: 'Phone number is required when email is not provided',
  })
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @IsNotEmpty({ message: 'Password is required' })
  @IsString()
  password: string;

  // Custom validation to ensure at least one of email or phoneNumber is provided
  @ValidateIf((o) => !o.email && !o.phoneNumber)
  @IsNotEmpty({ message: 'Either email or phone number must be provided' })
  emailOrPhone?: string;
}
