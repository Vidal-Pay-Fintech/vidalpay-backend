import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class RedeemRewardDto {
  @IsInt()
  @Min(1)
  points: number;

  @IsString()
  @IsOptional()
  rewardCode?: string;
}
