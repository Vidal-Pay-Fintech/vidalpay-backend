import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ValidateUtilityCustomerDto {
  @IsString()
  @IsNotEmpty()
  customerReference: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  serviceCode?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  billerCode?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  itemCode?: string;

  @IsOptional()
  @IsString()
  providerCode?: string;

  @IsOptional()
  @IsString()
  providerTitle?: string;

  @IsOptional()
  @IsString()
  type?: string;
}
