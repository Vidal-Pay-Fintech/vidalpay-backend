import { Injectable } from '@nestjs/common';
import { KycProvider } from 'src/common/enum/kyc-provider.enum';
import { SupportedRegion } from 'src/common/enum/supported-region.enum';
import { FlutterwaveKycProviderService } from './providers/flutterwave-kyc.provider';
import { LeadBankKycProviderService } from './providers/lead-bank-kyc.provider';
import {
  KycProviderAdapter,
  KycSubmissionPayload,
  KycSubmissionResult,
} from './interfaces/kyc-provider.interface';

@Injectable()
export class KycProviderRouterService {
  constructor(
    private readonly flutterwaveProvider: FlutterwaveKycProviderService,
    private readonly leadBankProvider: LeadBankKycProviderService,
  ) {}

  mapRegionToProvider(region: SupportedRegion | null): KycProvider | null {
    if (region === SupportedRegion.NG) {
      return KycProvider.FLUTTERWAVE;
    }

    if (region === SupportedRegion.US) {
      return KycProvider.LEAD_BANK;
    }

    return null;
  }

  getProviderForRegion(region: SupportedRegion | null): KycProviderAdapter | null {
    if (region === SupportedRegion.NG) {
      return this.flutterwaveProvider;
    }

    if (region === SupportedRegion.US) {
      return this.leadBankProvider;
    }

    return null;
  }

  async submitKyc(
    region: SupportedRegion | null,
    payload: KycSubmissionPayload,
  ): Promise<KycSubmissionResult | null> {
    const provider = this.getProviderForRegion(region);
    if (!provider) {
      return null;
    }

    return provider.submitKyc(payload);
  }
}
