import { Injectable } from '@nestjs/common';
import { KycProvider } from 'src/common/enum/kyc-provider.enum';
import { SupportedRegion } from 'src/common/enum/supported-region.enum';
import { FlutterwaveBankingProviderService } from './providers/flutterwave-banking.provider';
import { LeadBankingProviderService } from './providers/lead-bank-banking.provider';
import { RegionalProviderAdapter } from './interfaces/regional-provider.interface';

@Injectable()
export class ProviderRouterService {
  constructor(
    private readonly flutterwaveProvider: FlutterwaveBankingProviderService,
    private readonly leadBankProvider: LeadBankingProviderService,
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

  getProviderByRegion(region: SupportedRegion | null): RegionalProviderAdapter | null {
    if (region === SupportedRegion.NG) {
      return this.flutterwaveProvider;
    }

    if (region === SupportedRegion.US) {
      return this.leadBankProvider;
    }

    return null;
  }

  getProviderByName(
    provider: KycProvider | null,
  ): RegionalProviderAdapter | null {
    if (provider === KycProvider.FLUTTERWAVE) {
      return this.flutterwaveProvider;
    }

    if (provider === KycProvider.LEAD_BANK) {
      return this.leadBankProvider;
    }

    return null;
  }
}
