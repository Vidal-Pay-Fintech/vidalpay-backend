import { Injectable } from '@nestjs/common';
import { KycProvider } from 'src/common/enum/kyc-provider.enum';
import { KycStatus } from 'src/common/enum/kyc-status.enum';
import {
  KycProviderAdapter,
  KycSubmissionPayload,
  KycSubmissionResult,
} from '../interfaces/kyc-provider.interface';

@Injectable()
export class FlutterwaveKycProviderService implements KycProviderAdapter {
  readonly provider = KycProvider.FLUTTERWAVE;

  async submitKyc(
    payload: KycSubmissionPayload,
  ): Promise<KycSubmissionResult> {
    return {
      provider: this.provider,
      status: KycStatus.PENDING_REVIEW,
      submissionReference: `flw_kyc_${payload.user.id}_${Date.now()}`,
      blockedReason: 'KYC submitted and awaiting Flutterwave-aligned review.',
      providerResponse: {
        stubbed: true,
        region: payload.region,
        reviewMode: 'manual_staging_review',
      },
    };
  }
}
