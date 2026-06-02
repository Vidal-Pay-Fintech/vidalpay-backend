import { BadRequestException, Injectable } from '@nestjs/common';
import { RewardTransactionType } from 'src/database/entities/reward-transaction.entity';
import { RewardAccountRepository } from 'src/database/repositories/reward-account.repository';
import { RewardBalanceRepository } from 'src/database/repositories/reward-balance.repository';
import { RewardTransactionRepository } from 'src/database/repositories/reward-transaction.repository';
import { NotificationService } from 'src/notifications/notification.service';
import { RedeemRewardDto } from './dto/redeem-reward.dto';

const DEMO_STARTER_POINTS = 1000;

@Injectable()
export class RewardsService {
  constructor(
    private readonly rewardAccountRepository: RewardAccountRepository,
    private readonly rewardBalanceRepository: RewardBalanceRepository,
    private readonly rewardTransactionRepository: RewardTransactionRepository,
    private readonly notificationService: NotificationService,
  ) {}

  async getRewards(userId: string) {
    const account = await this.ensureRewardAccount(userId);
    const balances = await this.rewardBalanceRepository.findForUser(userId);

    return {
      account,
      balances,
      redeemOptions: [
        {
          code: 'DEMO_CASHBACK',
          title: 'Demo cashback credit',
          pointsRequired: 500,
          value: {
            amount: 5,
            currency: 'USD',
          },
          enabled: account.pointsBalance >= 500,
        },
      ],
    };
  }

  async getHistory(userId: string) {
    await this.ensureRewardAccount(userId);
    return this.rewardTransactionRepository.findForUser(userId);
  }

  async redeem(userId: string, dto: RedeemRewardDto) {
    const account = await this.ensureRewardAccount(userId);

    if (account.pointsBalance < dto.points) {
      throw new BadRequestException('Insufficient reward points.');
    }

    const nextBalance = account.pointsBalance - dto.points;
    await this.rewardAccountRepository.findOneAndUpdate(account.id, {
      pointsBalance: nextBalance,
      lifetimeRedeemed: account.lifetimeRedeemed + dto.points,
    });

    const balance = await this.rewardBalanceRepository.findByUserAndType(
      userId,
      'POINTS',
    );
    if (balance) {
      await this.rewardBalanceRepository.findOneAndUpdate(balance.id, {
        balance: nextBalance,
      });
    }

    const reference = `vp_reward_${Date.now()}`;
    const transaction = await this.rewardTransactionRepository.create({
      userId,
      type: RewardTransactionType.REDEEM,
      points: dto.points,
      reason: dto.rewardCode ?? 'Demo reward redemption',
      reference,
      metadata: {
        demo: true,
        valueEstimateUsd: Number((dto.points / 100).toFixed(2)),
      },
    });

    await this.notificationService.create({
      userId,
      type: 'REWARD_REDEEMED',
      title: 'Reward redeemed',
      body: `${dto.points} points were redeemed successfully.`,
      metadata: {
        reference,
        rewardCode: dto.rewardCode ?? null,
      },
    });

    return {
      message: 'Reward redeemed successfully.',
      account: await this.rewardAccountRepository.findByUserId(userId),
      transaction,
    };
  }

  private async ensureRewardAccount(userId: string) {
    const existing = await this.rewardAccountRepository.findByUserId(userId);
    if (existing) {
      return existing;
    }

    const account = await this.rewardAccountRepository.create({
      userId,
      pointsBalance: DEMO_STARTER_POINTS,
      lifetimeEarned: DEMO_STARTER_POINTS,
      lifetimeRedeemed: 0,
      tier: 'DEMO',
      metadata: {
        seededForDemo: true,
      },
    });

    await this.rewardBalanceRepository.create({
      userId,
      balanceType: 'POINTS',
      balance: DEMO_STARTER_POINTS,
      metadata: {
        seededForDemo: true,
      },
    });

    await this.rewardTransactionRepository.create({
      userId,
      type: RewardTransactionType.EARN,
      points: DEMO_STARTER_POINTS,
      reason: 'Demo starter points',
      reference: `vp_reward_seed_${Date.now()}`,
      metadata: {
        seededForDemo: true,
      },
    });

    return account;
  }
}
