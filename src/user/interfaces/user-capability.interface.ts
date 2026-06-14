import { KycProvider } from 'src/common/enum/kyc-provider.enum';
import { SupportedRegion } from 'src/common/enum/supported-region.enum';
import {
  DynamicLimitProfile,
  ProductAvailability,
} from './user-account.interface';

export interface UserCapabilities {
  region: SupportedRegion | null;
  provider: KycProvider | null;
  hasTransactionPin: boolean;
  canReceive: boolean;
  canTransfer: boolean;
  canTagTransfer: boolean;
  canBankTransfer: boolean;
  canInternalTransfer: boolean;
  canExternalTransfer: boolean;
  canExternalReceive: boolean;
  blockedReason: string | null;
  tagTransferBlockedReason: string | null;
  bankTransferBlockedReason: string | null;
  transferCapabilities: {
    tag: {
      enabled: boolean;
      blockedReason: string | null;
    };
    bank: {
      enabled: boolean;
      blockedReason: string | null;
    };
  };
  limits: DynamicLimitProfile;
  productAvailability: ProductAvailability;
}
