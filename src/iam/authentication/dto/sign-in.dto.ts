import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Role } from 'src/common/enum/role.enum';
import NoSpecialCharacters from 'src/common/specialCharacters';

export class SignInDto {
  // @IsNotEmpty()
  @IsOptional()
  email: string;

  // @IsNotEmpty()
  @IsOptional()
  phoneNumber: string;

  @IsNotEmpty()
  password: string;

  // @IsEnum(Role)
  // role: Role;
}
