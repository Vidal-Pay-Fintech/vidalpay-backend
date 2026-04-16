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
  destinationBankCode?: string | null;
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

export interface ProviderAirtimeNetwork {
  id: string;
  code: string;
  title: string;
  description: string | null;
  billerCode: string | null;
  itemCode: string | null;
  serviceCode: string | null;
  currency: Currency;
  minAmount: number | null;
  maxAmount: number | null;
  enabled: boolean;
}

export interface ProviderAirtimeCatalog {
  region: SupportedRegion;
  provider: KycProvider;
  source: 'PROVIDER' | 'CURATED_FALLBACK';
  message: string | null;
  networks: ProviderAirtimeNetwork[];
}

export interface ProviderDataPlan {
  id: string;
  code: string;
  title: string;
  description: string | null;
  amount: number | null;
  currency: Currency;
  serviceCode: string | null;
  billerCode: string | null;
  itemCode: string | null;
  type: string | null;
  enabled: boolean;
}

export interface ProviderDataNetwork {
  id: string;
  code: string;
  title: string;
  description: string | null;
  billerCode: string | null;
  plans: ProviderDataPlan[];
}

export interface ProviderDataCatalog {
  region: SupportedRegion;
  provider: KycProvider;
  source: 'PROVIDER' | 'CURATED_FALLBACK';
  message: string | null;
  networks: ProviderDataNetwork[];
}

export interface ProviderUtilityCatalogItem {
  id: string;
  code: string;
  title: string;
  description: string | null;
  amount: number | null;
  currency: Currency;
  serviceCode: string | null;
  billerCode: string | null;
  itemCode: string | null;
  type: string | null;
  requiresValidation: boolean;
  customerReferenceLabel: string | null;
  enabled: boolean;
}

export interface ProviderUtilityCatalogProvider {
  id: string;
  code: string;
  title: string;
  description: string | null;
  billerCode: string | null;
  itemCode: string | null;
  type: string | null;
  requiresValidation: boolean;
  customerReferenceLabel: string | null;
  currency: Currency;
  enabled: boolean;
  items: ProviderUtilityCatalogItem[];
}

export interface ProviderUtilityCatalogCategory {
  id: string;
  code: string;
  title: string;
  description: string | null;
  providers: ProviderUtilityCatalogProvider[];
}

export interface ProviderUtilitiesCatalog {
  region: SupportedRegion;
  provider: KycProvider;
  source: 'PROVIDER' | 'CURATED_FALLBACK';
  message: string | null;
  categories: ProviderUtilityCatalogCategory[];
}

export interface ProviderUtilityValidationPayload {
  serviceCode?: string | null;
  billerCode?: string | null;
  itemCode?: string | null;
  customerReference: string;
  providerCode?: string | null;
  providerTitle?: string | null;
  type?: string | null;
}

export interface ProviderUtilityValidationResult {
  valid: boolean;
  validationAvailable: boolean;
  resolvedName: string | null;
  customerReference: string;
  provider: {
    code: string | null;
    title: string | null;
    billerCode: string | null;
    itemCode: string | null;
    type: string | null;
  };
  fee: number | null;
  minimumAmount: number | null;
  maximumAmount: number | null;
  currency: Currency | null;
  message: string;
  metadata?: Record<string, any> | null;
}

export interface ProviderCardTopUpStatus {
  reference: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELED';
  provider: KycProvider;
  amount: number | null;
  currency: Currency | null;
  providerReference: string | null;
  externalReference: string | null;
  message: string;
  creditedAt: string | null;
  checkoutUrl: string | null;
  redirectUrl: string | null;
}

export interface ProviderBankOption {
  id: string;
  code: string;
  name: string;
  country: SupportedRegion;
  currency: Currency;
  enabled: boolean;
  metadata?: Record<string, any> | null;
}

export interface ProviderBankCatalog {
  region: SupportedRegion;
  provider: KycProvider;
  source: 'PROVIDER' | 'CURATED_FALLBACK';
  message: string | null;
  banks: ProviderBankOption[];
}

export interface ProviderAccountResolutionPayload {
  currency: Currency;
  destinationAccountNumber: string;
  destinationBankCode?: string | null;
  destinationBankName?: string | null;
}

export interface ProviderAccountResolutionResult {
  resolved: boolean;
  accountNumber: string;
  accountName: string | null;
  bankCode: string | null;
  bankName: string | null;
  currency: Currency;
  provider: KycProvider;
  message: string;
  metadata?: Record<string, any> | null;
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
  getAirtimeCatalog?(): Promise<ProviderAirtimeCatalog>;
  getDataCatalog?(): Promise<ProviderDataCatalog>;
  getUtilitiesCatalog?(): Promise<ProviderUtilitiesCatalog>;
  validateUtilityCustomer?(
    payload: ProviderUtilityValidationPayload,
  ): Promise<ProviderUtilityValidationResult>;
  getBankCatalog?(): Promise<ProviderBankCatalog>;
  resolveExternalAccount?(
    payload: ProviderAccountResolutionPayload,
  ): Promise<ProviderAccountResolutionResult>;
  getCardTopUpStatus?(
    reference: string,
  ): Promise<ProviderCardTopUpStatus | null>;
  handleWebhook(
    payload: Record<string, any>,
    headers?: Record<string, string | string[] | undefined>,
  ): Promise<ProviderWebhookExecution>;
}
