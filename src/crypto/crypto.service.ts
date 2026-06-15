import { Injectable } from '@nestjs/common';
import { FeatureFlagService } from 'src/feature-flags/feature-flag.service';
import { ProviderStatusService } from 'src/providers/provider-status.service';
import { UserService } from 'src/user/user.service';
import { API_MESSAGES } from 'src/utils/apiMessages';

const CRYPTO_PREVIEW_MESSAGE =
  'Crypto is available as a preview while live trading access is being staged.';
const CRYPTO_LIVE_MESSAGE = 'Crypto trading is live.';

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
    private readonly providerStatusService: ProviderStatusService,
  ) {}

  async getOverview(userId: string) {
    const accountOverview = await this.userService.getAccountOverview(userId);
    const productCryptoAvailable =
      accountOverview.productAvailability.crypto ??
      this.featureFlags.isEnabled('ENABLE_CRYPTO_DEMO');
    const zeroHashStatus =
      this.providerStatusService
        .getProviderStatuses()
        .find((provider) => provider.provider === 'Zero Hash') ?? null;
    const liveEnabled = Boolean(
      zeroHashStatus?.enabled && zeroHashStatus.liveTested,
    );
    const enabled = productCryptoAvailable && liveEnabled;
    const staged = productCryptoAvailable && !liveEnabled;
    const state = enabled
      ? 'TRADE_LIVE'
      : staged
        ? 'PREVIEW_STAGED'
        : 'UNAVAILABLE';
    const screen = enabled
      ? 'CRYPTO_TRADE'
      : staged
        ? 'CRYPTO_PREVIEW'
        : 'CRYPTO_COMING_SOON';
    const message = enabled
      ? CRYPTO_LIVE_MESSAGE
      : staged
        ? CRYPTO_PREVIEW_MESSAGE
        : API_MESSAGES.CRYPTO_COMING_SOON;

    return {
      enabled,
      state,
      screen,
      tradeEnabled: enabled,
      previewEnabled: staged,
      productAvailable: productCryptoAvailable,
      cryptoOverview: {
        enabled,
        state,
        screen,
        tradeEnabled: enabled,
        previewEnabled: staged,
        productAvailable: productCryptoAvailable,
        status: enabled ? 'LIVE' : staged ? 'PREVIEW' : 'DISABLED',
        stage: enabled ? 'LIVE' : staged ? 'STAGED' : 'UNAVAILABLE',
        blockedByKyc: false,
        message,
        previewMessage: staged ? CRYPTO_PREVIEW_MESSAGE : null,
        comingSoonCopy: enabled ? null : API_MESSAGES.CRYPTO_COMING_SOON,
        provider: zeroHashStatus?.provider ?? 'Zero Hash',
        providerMode: zeroHashStatus?.mode ?? 'mock',
        providerStatus: zeroHashStatus?.status ?? null,
        readinessStatus: zeroHashStatus?.readinessStatus ?? null,
        completionStatus: zeroHashStatus?.completionStatus ?? null,
        liveTested: zeroHashStatus?.liveTested ?? false,
        envConfigured: zeroHashStatus?.envConfigured ?? false,
        missingEnvVars: zeroHashStatus?.missingEnvVars ?? [],
        failureReason: zeroHashStatus?.failureReason ?? null,
      },
      comingSoon: !enabled,
      preview: staged,
      message,
      region: accountOverview.region,
      provider: accountOverview.provider,
      productAvailability: {
        crypto: productCryptoAvailable,
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
          status: enabled ? 'LIVE' : staged ? 'PREVIEW' : 'DISABLED',
          state,
          screen,
          previewEnabled: staged,
          tradeEnabled: enabled,
        },
        {
          code: 'STAKING',
          title: 'Staking',
          enabled: false,
          status: 'DISABLED',
        },
        {
          code: 'MICRO_LOANS',
          title: 'Micro-Loans',
          enabled: false,
          status: 'DISABLED',
        },
      ],
    };
  }

  getAssets() {
    return CRYPTO_ASSETS;
  }
}
