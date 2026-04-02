import { KycProvider } from 'src/common/enum/kyc-provider.enum';
import { SupportedRegion } from 'src/common/enum/supported-region.enum';

export interface UserLimits {
  policyVersion: string;
  tier: 'UNSUPPORTED' | 'PENDING_KYC' | 'VERIFIED';
  receive: {
    dailyAmount: number | null;
    monthlyAmount: number | null;
    managedBy: string;
  };
  transfer: {
    dailyAmount: number | null;
    monthlyAmount: number | null;
    managedBy: string;
  };
  progressiveIncreases: {
    enabled: boolean;
    basis: string;
    reviewRequired: boolean;
  };
  futureProducts: {
    loanEligible: boolean;
    taxFilingEligible: boolean;
  };
}

export interface UserCapabilities {
  region: SupportedRegion | null;
  provider: KycProvider | null;
  canReceive: boolean;
  canTransfer: boolean;
  blockedReason: string | null;
  limits: UserLimits;
}
