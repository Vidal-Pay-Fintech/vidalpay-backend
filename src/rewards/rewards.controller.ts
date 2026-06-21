import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data-interfaces';
import { RedeemRewardDto } from './dto/redeem-reward.dto';
import { RewardsService } from './rewards.service';
import { DemoOnly } from 'src/feature-flags/demo-only.decorator';

@ApiTags('Rewards')
@Controller('rewards')
@DemoOnly()
export class RewardsController {
  constructor(private readonly rewardsService: RewardsService) {}

  @Get()
  getRewards(@ActiveUser() user: ActiveUserData) {
    return this.rewardsService.getRewards(user.sub);
  }

  @Get('history')
  getHistory(@ActiveUser() user: ActiveUserData) {
    return this.rewardsService.getHistory(user.sub);
  }

  @Post('redeem')
  redeem(
    @ActiveUser() user: ActiveUserData,
    @Body() redeemRewardDto: RedeemRewardDto,
  ) {
    return this.rewardsService.redeem(user.sub, redeemRewardDto);
  }
}
