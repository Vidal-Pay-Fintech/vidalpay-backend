import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class ReauthDto {
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/, {
    message: 'pin must be a 4-digit number',
  })
  pin?: string;

  // Keep the descriptive field name accepted for clients that use it.
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/, {
    message: 'transactionPin must be a 4-digit number',
  })
  transactionPin?: string;
}
