import { Module } from '@nestjs/common';
import { KycProviderRouterService } from './kyc/kyc-provider-router.service';
import { FlutterwaveKycProviderService } from './kyc/providers/flutterwave-kyc.provider';
import { LeadBankKycProviderService } from './kyc/providers/lead-bank-kyc.provider';

@Module({
  providers: [
    KycProviderRouterService,
    FlutterwaveKycProviderService,
    LeadBankKycProviderService,
  ],
  exports: [KycProviderRouterService],
})
export class IntegrationsModule {}
