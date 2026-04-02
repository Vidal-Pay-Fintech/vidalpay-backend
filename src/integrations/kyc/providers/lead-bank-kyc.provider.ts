import { Injectable } from '@nestjs/common';
import { KycProvider } from 'src/common/enum/kyc-provider.enum';
import { KycStatus } from 'src/common/enum/kyc-status.enum';
import {
  KycProviderAdapter,
  KycSubmissionPayload,
  KycSubmissionResult,
} from '../interfaces/kyc-provider.interface';

@Injectable()
export class LeadBankKycProviderService implements KycProviderAdapter {
  readonly provider = KycProvider.LEAD_BANK;

  async submitKyc(
    payload: KycSubmissionPayload,
  ): Promise<KycSubmissionResult> {
    return {
      provider: this.provider,
      status: KycStatus.PENDING_REVIEW,
      submissionReference: `lead_kyc_${payload.user.id}_${Date.now()}`,
      blockedReason: 'KYC submitted and awaiting Lead Bank-aligned review.',
      providerResponse: {
        stubbed: true,
        region: payload.region,
        reviewMode: 'manual_staging_review',
      },
    };
  }
}
