import { KycProvider } from 'src/common/enum/kyc-provider.enum';
import {
  ProviderOperationStatus,
  ProviderOperationType,
} from 'src/common/enum/provider-operation.enum';
import { SupportedRegion } from 'src/common/enum/supported-region.enum';
import { Wallet } from 'src/database/entities/wallet.entity';
import { User } from 'src/database/entities/user.entity';
import { Currency } from 'src/utils/enums/wallet.enum';

export interface ProviderWalletRail {
  walletId: string;
  currency: Currency;
  provider: KycProvider;
  region: SupportedRegion;
  railType: 'VIRTUAL_ACCOUNT' | 'ACH';
  accountNumber: string | null;
  routingNumber: string | null;
  accountName: string | null;
  bankName: string | null;
  sortCode: string | null;
  providerCustomerId: string | null;
  providerAccountId: string | null;
  providerVirtualAccountId: string | null;
  providerReference: string | null;
  providerMetadata: Record<string, any> | null;
}

export interface ExternalTransferPayload {
  user: User;
  wallet: Wallet;
  amount: number;
  currency: Currency;
  destinationAccountNumber: string;
  destinationAccountName?: string | null;
  destinationBankName?: string | null;
  destinationRoutingNumber?: string | null;
  narration?: string | null;
  metadata?: Record<string, any> | null;
}

export interface CardTopUpIntentPayload {
  user: User;
  wallet: Wallet;
  amount: number;
  currency: Currency;
  redirectUrl?: string | null;
  metadata?: Record<string, any> | null;
}

export interface ProviderProductPayload {
  user: User;
  wallet: Wallet;
  amount: number;
  currency: Currency;
  phoneNumber?: string | null;
  serviceCode?: string | null;
  customerReference?: string | null;
  metadata?: Record<string, any> | null;
}

export interface ProviderOperationExecution {
  provider: KycProvider;
  operationType: ProviderOperationType;
  status: ProviderOperationStatus;
  reference: string;
  externalReference?: string | null;
  responsePayload?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
}

export interface ProviderCardTopUpIntentExecution
  extends ProviderOperationExecution {
  checkoutUrl: string | null;
  redirectUrl: string | null;
  expiresAt?: string | null;
}

export interface ProviderWebhookExecution {
  provider: KycProvider;
  eventType: string;
  eventReference?: string | null;
  operationReference?: string | null;
  operationStatus?: ProviderOperationStatus | null;
  processed: boolean;
  ignored?: boolean;
  metadata?: Record<string, any> | null;
}

export interface RegionalProviderAdapter {
  readonly provider: KycProvider;
  readonly region: SupportedRegion;
  supportsOperation(operationType: ProviderOperationType): boolean;
  provisionReceiveRails(
    user: User,
    wallets: Wallet[],
  ): Promise<ProviderWalletRail[]>;
  createExternalTransfer(
    payload: ExternalTransferPayload,
  ): Promise<ProviderOperationExecution>;
  createCardTopUpIntent?(
    payload: CardTopUpIntentPayload,
  ): Promise<ProviderCardTopUpIntentExecution>;
  purchaseAirtime?(
    payload: ProviderProductPayload,
  ): Promise<ProviderOperationExecution>;
  purchaseData?(
    payload: ProviderProductPayload,
  ): Promise<ProviderOperationExecution>;
  payUtility?(
    payload: ProviderProductPayload,
  ): Promise<ProviderOperationExecution>;
  handleWebhook(
    payload: Record<string, any>,
    headers?: Record<string, string | string[] | undefined>,
  ): Promise<ProviderWebhookExecution>;
}
