import { Injectable } from '@nestjs/common';
import { FeatureFlagService } from 'src/feature-flags/feature-flag.service';
import { UserService } from 'src/user/user.service';
import { API_MESSAGES } from 'src/utils/apiMessages';

const CRYPTO_ASSETS = [
  {
    symbol: 'BTC',
    name: 'Bitcoin',
    enabled: false,
    stakingAvailable: false,
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    enabled: false,
    stakingAvailable: false,
  },
  {
    symbol: 'USDT',
    name: 'Tether',
    enabled: false,
    stakingAvailable: false,
  },
];

@Injectable()
export class CryptoService {
  constructor(
    private readonly userService: UserService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  async getOverview(userId: string) {
    const accountOverview = await this.userService.getAccountOverview(userId);
    const enabled = this.featureFlags.isEnabled('ENABLE_CRYPTO_DEMO');

    return {
      enabled,
      comingSoon: !enabled,
      message: enabled ? 'Crypto demo mode is enabled.' : API_MESSAGES.CRYPTO_COMING_SOON,
      region: accountOverview.region,
      provider: accountOverview.provider,
      productAvailability: {
        crypto: enabled,
        staking: false,
        microLoans: false,
      },
      portfolio: {
        totalValue: 0,
        currency: 'USD',
        positions: [],
      },
      features: [
        {
          code: 'CRYPTO_WALLET',
          title: 'Crypto Wallet',
          enabled,
        },
        {
          code: 'STAKING',
          title: 'Staking',
          enabled: false,
        },
        {
          code: 'MICRO_LOANS',
          title: 'Micro-Loans',
          enabled: false,
        },
      ],
    };
  }

  getAssets() {
    return CRYPTO_ASSETS;
  }
}
