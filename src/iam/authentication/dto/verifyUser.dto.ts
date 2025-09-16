import { IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyUserDto {
  @IsNotEmpty()
  @IsString()
  @Length(6, 6)
  token: string;
}
