import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpsertKycAddressDto {
  @IsString()
  @MinLength(2)
  addressLine1: string;

  @IsOptional()
  @IsString()
  addressLine2?: string;

  @IsString()
  @MinLength(2)
  city: string;

  @IsString()
  @MinLength(2)
  stateOrRegion: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsString()
  @MinLength(2)
  country: string;

  @IsString()
  @MinLength(2)
  countryCode: string;
}
