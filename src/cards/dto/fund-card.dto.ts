import { IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class FundCardDto {
  @IsNumber()
  @IsPositive()
  @Min(1)
  amount: number;

  @IsString()
  @IsOptional()
  note?: string;
}
