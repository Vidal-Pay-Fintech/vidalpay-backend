import { KycProvider } from 'src/common/enum/kyc-provider.enum';
import { KycStatus } from 'src/common/enum/kyc-status.enum';
import { SupportedRegion } from 'src/common/enum/supported-region.enum';
import { UserKyc } from 'src/database/entities/user-kyc.entity';
import { User } from 'src/database/entities/user.entity';

export interface KycSubmissionPayload {
  user: User;
  kyc: UserKyc;
  region: SupportedRegion;
}

export interface KycSubmissionResult {
  provider: KycProvider;
  status: KycStatus;
  submissionReference: string;
  blockedReason: string | null;
  providerResponse: Record<string, any> | null;
}

export interface KycProviderAdapter {
  readonly provider: KycProvider;
  submitKyc(payload: KycSubmissionPayload): Promise<KycSubmissionResult>;
}
