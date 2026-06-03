import { KycProvider } from 'src/common/enum/kyc-provider.enum';

export const WEBHOOK_PROVIDER_MAP: Record<string, KycProvider> = {
  flutterwave: KycProvider.FLUTTERWAVE,
  smileid: KycProvider.SMILE_ID,
  leadbank: KycProvider.LEAD_BANK,
  'lead-bank': KycProvider.LEAD_BANK,
  verto: KycProvider.VERTO,
  zerohash: KycProvider.ZERO_HASH,
  'zero-hash': KycProvider.ZERO_HASH,
  cowrywise: KycProvider.COWRYWISE,
  sardine: KycProvider.SARDINE,
};
