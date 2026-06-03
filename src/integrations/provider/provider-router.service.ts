import { Injectable } from '@nestjs/common';
import { KycProvider } from 'src/common/enum/kyc-provider.enum';
import { SupportedRegion } from 'src/common/enum/supported-region.enum';
import { FlutterwaveBankingProviderService } from './providers/flutterwave-banking.provider';
import { LeadBankingProviderService } from './providers/lead-bank-banking.provider';
import { RegionalProviderAdapter } from './interfaces/regional-provider.interface';
import {
  MockFlutterwaveBankingProviderService,
  MockLeadBankingProviderService,
} from './providers/mock-banking.provider';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ProviderRouterService {
  constructor(
    private readonly flutterwaveProvider: FlutterwaveBankingProviderService,
    private readonly leadBankProvider: LeadBankingProviderService,
    private readonly mockFlutterwaveProvider: MockFlutterwaveBankingProviderService,
    private readonly mockLeadBankProvider: MockLeadBankingProviderService,
    private readonly configService: ConfigService,
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
      if (this.getMode('PAYMENT_PROVIDER_MODE') === 'mock') {
        return this.mockFlutterwaveProvider;
      }

      return this.flutterwaveProvider;
    }

    if (region === SupportedRegion.US) {
      if (this.getMode('USD_PROVIDER_MODE') === 'mock') {
        return this.mockLeadBankProvider;
      }

      return this.leadBankProvider;
    }

    return null;
  }

  getProviderByName(
    provider: KycProvider | null,
  ): RegionalProviderAdapter | null {
    if (provider === KycProvider.FLUTTERWAVE) {
      if (this.getMode('PAYMENT_PROVIDER_MODE') === 'mock') {
        return this.mockFlutterwaveProvider;
      }

      return this.flutterwaveProvider;
    }

    if (provider === KycProvider.LEAD_BANK) {
      if (this.getMode('USD_PROVIDER_MODE') === 'mock') {
        return this.mockLeadBankProvider;
      }

      return this.leadBankProvider;
    }

    return null;
  }

  private getMode(key: string) {
    return String(this.configService.get<string>(key) ?? process.env[key] ?? 'mock')
      .trim()
      .toLowerCase();
  }
}
