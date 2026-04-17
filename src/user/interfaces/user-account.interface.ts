import { ClientKycStatus } from 'src/common/enum/client-kyc-status.enum';
import { KycProvider } from 'src/common/enum/kyc-provider.enum';
import { KycSectionCode } from 'src/common/enum/kyc-section.enum';
import { SupportedRegion } from 'src/common/enum/supported-region.enum';
import { Currency } from 'src/utils/enums/wallet.enum';

export interface ProductAvailability {
  wallet: boolean;
  transfer: boolean;
  internalTransfer?: boolean;
  externalTransfer?: boolean;
  receive?: boolean;
  deposit: boolean;
  cardTopUp: boolean;
  conversion: boolean;
  airtime: boolean;
  data: boolean;
  utilities: boolean;
  loan: boolean;
  taxFiling: boolean;
  crypto: boolean;
}

export interface NormalizedLimitBucket {
  daily: number | null;
  monthly: number | null;
  currency: Currency | 'MIXED' | null;
  managedBy: string;
}

export interface DynamicLimitProfile {
  policyVersion: string;
  tier: 'UNSUPPORTED' | 'PENDING_KYC' | 'VERIFIED';
  outbound: NormalizedLimitBucket;
  inbound: NormalizedLimitBucket;
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
  lastEvaluatedAt: string | null;
  trustSignals: {
    transactionVolume: number | null;
    transactionConsistency: number | null;
    activeDurationDays: number | null;
  };
}

export interface WalletRailDetails {
  walletId: string;
  currency: Currency;
  provider: KycProvider | null;
  region: SupportedRegion | null;
  railType: 'VIRTUAL_ACCOUNT' | 'ACH' | 'INTERNAL_ONLY';
  balance: number;
  accountNumber: string | null;
  routingNumber: string | null;
  accountName: string | null;
  bankName: string | null;
  sortCode: string | null;
  receiveEnabled: boolean;
  transferEnabled: boolean;
  externalReceiveEnabled: boolean;
  externalTransferEnabled: boolean;
  providerCustomerId: string | null;
  providerAccountId: string | null;
  providerVirtualAccountId: string | null;
  providerReference: string | null;
  providerMetadata: Record<string, any> | null;
  provisioningStatus?:
    | 'READY'
    | 'PENDING'
    | 'DEFERRED'
    | 'UNAVAILABLE';
  blockedReason?: string | null;
  supportedOperations?: Array<'RECEIVE' | 'TRANSFER' | 'TOP_UP'>;
}

export interface FundingMethodAvailability {
  code: 'BANK_TRANSFER' | 'CARD_TOP_UP';
  title: string;
  description: string;
  enabled: boolean;
  provider: KycProvider | null;
  blockedReason: string | null;
  currencies: Currency[];
  action:
    | {
        type: 'API';
        path: string;
        method: 'POST' | 'GET';
      }
    | {
        type: 'INFO';
        path: null;
        method: null;
      };
}

export interface KycSectionProgress {
  section: KycSectionCode;
  title: string;
  description: string;
  status: ClientKycStatus;
  completed: boolean;
  rejectionReason: string | null;
}
