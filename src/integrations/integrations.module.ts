import { Module } from '@nestjs/common';
import { KycProviderRouterService } from './kyc/kyc-provider-router.service';
import { FlutterwaveKycProviderService } from './kyc/providers/flutterwave-kyc.provider';
import { LeadBankKycProviderService } from './kyc/providers/lead-bank-kyc.provider';
import { ProviderRouterService } from './provider/provider-router.service';
import { FlutterwaveBankingProviderService } from './provider/providers/flutterwave-banking.provider';
import { LeadBankingProviderService } from './provider/providers/lead-bank-banking.provider';
import { ProviderOperationsService } from './provider/provider-operations.service';
import { ProviderWebhookController } from './provider/provider-webhook.controller';

@Module({
  controllers: [ProviderWebhookController],
  providers: [
    KycProviderRouterService,
    FlutterwaveKycProviderService,
    LeadBankKycProviderService,
    ProviderRouterService,
    FlutterwaveBankingProviderService,
    LeadBankingProviderService,
    ProviderOperationsService,
  ],
  exports: [KycProviderRouterService, ProviderRouterService, ProviderOperationsService],
})
export class IntegrationsModule {}
