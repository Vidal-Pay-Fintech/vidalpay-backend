import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { KycProvider } from 'src/common/enum/kyc-provider.enum';
import {
  ProviderOperationStatus,
  ProviderOperationType,
} from 'src/common/enum/provider-operation.enum';
import { SupportedRegion } from 'src/common/enum/supported-region.enum';
import { Wallet } from 'src/database/entities/wallet.entity';
import { User } from 'src/database/entities/user.entity';
import { WalletRepository } from 'src/database/repositories/wallet.repository';
import { API_MESSAGES } from 'src/utils/apiMessages';
import { Currency } from 'src/utils/enums/wallet.enum';
import {
  CardTopUpIntentPayload,
  ExternalTransferPayload,
  ProviderAccountResolutionPayload,
  ProviderAccountResolutionResult,
  ProviderAirtimeCatalog,
  ProviderBankCatalog,
  ProviderCardTopUpStatus,
  ProviderCardTopUpIntentExecution,
  ProviderDataCatalog,
  ProviderOperationExecution,
  ProviderProductPayload,
  ProviderUtilityValidationPayload,
  ProviderUtilityValidationResult,
  ProviderUtilitiesCatalog,
  ProviderWalletRail,
  ProviderWebhookExecution,
  RegionalProviderAdapter,
} from '../interfaces/regional-provider.interface';
import {
  FLUTTERWAVE_AIRTIME_FALLBACK_CATALOG,
  FLUTTERWAVE_BILL_CATEGORY_CODES,
  FLUTTERWAVE_DATA_FALLBACK_CATALOG,
  FLUTTERWAVE_UTILITIES_FALLBACK_CATALOG,
} from './flutterwave-ng-catalog.data';

type FlutterwaveBiller = {
  id?: number | string;
  name?: string;
  short_name?: string;
  description?: string;
  biller_code?: string;
  country_code?: string;
  logo?: string | null;
};

type FlutterwaveBillItem = {
  id?: number | string;
  biller_code?: string;
  item_code?: string;
  name?: string;
  short_name?: string;
  label_name?: string;
  amount?: number | string | null;
  fee?: number | string | null;
  minimum?: number | string | null;
  maximum?: number | string | null;
  default_commission?: number | string | null;
  country?: string | null;
  country_code?: string | null;
};

type FlutterwaveBank = {
  id?: number | string;
  code?: string;
  name?: string;
};

type RailProvisioningState =
  | 'READY'
  | 'PENDING'
  | 'DEFERRED'
  | 'UNAVAILABLE';

const FLUTTERWAVE_BANK_FALLBACK_CATALOG: ProviderBankCatalog = {
  region: SupportedRegion.NG,
  provider: KycProvider.FLUTTERWAVE,
  source: 'CURATED_FALLBACK',
  message:
    'Using the VidalPay fallback NG bank directory while live bank discovery is unavailable.',
  banks: [
    { id: '044', code: '044', name: 'Access Bank', country: SupportedRegion.NG, currency: Currency.NGN, enabled: true },
    { id: '011', code: '011', name: 'First Bank of Nigeria', country: SupportedRegion.NG, currency: Currency.NGN, enabled: true },
    { id: '058', code: '058', name: 'Guaranty Trust Bank', country: SupportedRegion.NG, currency: Currency.NGN, enabled: true },
    { id: '033', code: '033', name: 'United Bank for Africa', country: SupportedRegion.NG, currency: Currency.NGN, enabled: true },
    { id: '057', code: '057', name: 'Zenith Bank', country: SupportedRegion.NG, currency: Currency.NGN, enabled: true },
    { id: '50211', code: '50211', name: 'Kuda Microfinance Bank', country: SupportedRegion.NG, currency: Currency.NGN, enabled: true },
    { id: '999992', code: '999992', name: 'OPay', country: SupportedRegion.NG, currency: Currency.NGN, enabled: true },
    { id: '100004', code: '100004', name: 'PalmPay', country: SupportedRegion.NG, currency: Currency.NGN, enabled: true },
  ],
};

interface FlutterwaveConfig {
  baseUrl: string;
  secretKey: string;
  secretHash: string | null;
}

@Injectable()
export class FlutterwaveBankingProviderService implements RegionalProviderAdapter {
  readonly provider = KycProvider.FLUTTERWAVE;
  readonly region = SupportedRegion.NG;

  private readonly logger = new Logger(FlutterwaveBankingProviderService.name);
  private readonly catalogCache = new Map<
    string,
    {
      expiresAt: number;
      value: unknown;
    }
  >();
  private readonly catalogCacheTtlMs = 10 * 60 * 1000;

  constructor(private readonly walletRepository: WalletRepository) {}

  supportsOperation(operationType: ProviderOperationType): boolean {
    return [
      ProviderOperationType.RAIL_PROVISIONING,
      ProviderOperationType.CARD_TOPUP,
      ProviderOperationType.EXTERNAL_TRANSFER,
      ProviderOperationType.AIRTIME,
      ProviderOperationType.DATA,
      ProviderOperationType.UTILITY,
    ].includes(operationType);
  }

  async getAirtimeCatalog(): Promise<ProviderAirtimeCatalog> {
    return this.getCachedCatalog('airtime', async () => {
      try {
        const billers = await this.fetchBillersByCategory(
          FLUTTERWAVE_BILL_CATEGORY_CODES.airtime,
        );
        const networks = await this.buildAirtimeCatalogFromFlutterwave(billers);

        if (!networks.length) {
          return FLUTTERWAVE_AIRTIME_FALLBACK_CATALOG;
        }

        return {
          region: this.region,
          provider: this.provider,
          source: 'PROVIDER',
          message: null,
          networks,
        };
      } catch (error) {
        this.logger.warn(
          `Flutterwave airtime catalog discovery failed: ${(error as Error).message}`,
        );
        return FLUTTERWAVE_AIRTIME_FALLBACK_CATALOG;
      }
    });
  }

  async getDataCatalog(): Promise<ProviderDataCatalog> {
    return this.getCachedCatalog('data', async () => {
      try {
        const billers = await this.fetchBillersByCategory(
          FLUTTERWAVE_BILL_CATEGORY_CODES.data,
        );
        const networks = await this.buildDataCatalogFromFlutterwave(billers);

        if (!networks.length) {
          return FLUTTERWAVE_DATA_FALLBACK_CATALOG;
        }

        return {
          region: this.region,
          provider: this.provider,
          source: 'PROVIDER',
          message: null,
          networks,
        };
      } catch (error) {
        this.logger.warn(
          `Flutterwave data catalog discovery failed: ${(error as Error).message}`,
        );
        return FLUTTERWAVE_DATA_FALLBACK_CATALOG;
      }
    });
  }

  async getUtilitiesCatalog(): Promise<ProviderUtilitiesCatalog> {
    return this.getCachedCatalog('utilities', async () => {
      try {
        const categories = await this.buildUtilitiesCatalogFromFlutterwave();

        if (!categories.length) {
          return FLUTTERWAVE_UTILITIES_FALLBACK_CATALOG;
        }

        return {
          region: this.region,
          provider: this.provider,
          source: 'PROVIDER',
          message: null,
          categories,
        };
      } catch (error) {
        this.logger.warn(
          `Flutterwave utilities catalog discovery failed: ${(error as Error).message}`,
        );
        return FLUTTERWAVE_UTILITIES_FALLBACK_CATALOG;
      }
    });
  }

  async getBankCatalog(): Promise<ProviderBankCatalog> {
    return this.getCachedCatalog('banks', async () => {
      try {
        const response = await this.flutterwaveRequest<{
          data?: FlutterwaveBank[];
        }>('GET', '/banks/NG');
        const banks = (response?.data ?? [])
          .map((bank) => ({
            id: String(bank.id ?? bank.code ?? bank.name ?? ''),
            code: String(bank.code ?? '').trim(),
            name: String(bank.name ?? '').trim(),
            country: this.region,
            currency: Currency.NGN,
            enabled: Boolean(String(bank.code ?? '').trim() && String(bank.name ?? '').trim()),
          }))
          .filter((bank) => bank.enabled);

        return this.buildBankCatalogResponse(
          banks.length ? banks : FLUTTERWAVE_BANK_FALLBACK_CATALOG.banks,
          banks.length ? 'PROVIDER' : 'CURATED_FALLBACK',
        );
      } catch (error) {
        this.logger.warn(
          `Flutterwave bank catalog discovery failed: ${(error as Error).message}`,
        );
        return this.buildBankCatalogResponse(
          FLUTTERWAVE_BANK_FALLBACK_CATALOG.banks,
          'CURATED_FALLBACK',
        );
      }
    });
  }

  async resolveExternalAccount(
    payload: ProviderAccountResolutionPayload,
  ): Promise<ProviderAccountResolutionResult> {
    const bankCode = await this.resolveBankCode({
      destinationAccountNumber: payload.destinationAccountNumber,
      destinationBankCode: payload.destinationBankCode ?? null,
      destinationBankName: payload.destinationBankName ?? null,
      user: {} as User,
      wallet: {} as Wallet,
      amount: 0,
      currency: payload.currency,
      narration: null,
      metadata: null,
    });

    if (!bankCode) {
      return {
        resolved: false,
        accountNumber: payload.destinationAccountNumber,
        accountName: null,
        bankCode: null,
        bankName: payload.destinationBankName ?? null,
        currency: payload.currency,
        provider: this.provider,
        message: 'A valid destination bank is required for NG external transfers.',
      };
    }

    if (this.isFlutterwaveSandboxMode() && bankCode !== '044') {
      return this.buildSandboxAccountResolutionResult(payload, bankCode);
    }

    try {
      const response = await this.flutterwaveRequest<{
        data?: Record<string, any>;
      }>('POST', '/accounts/resolve', {
        account_number: payload.destinationAccountNumber,
        account_bank: bankCode,
      });
      const data = (response?.data ?? response ?? {}) as Record<string, any>;
      const bankName =
        payload.destinationBankName ??
        this.findBankNameByCode(bankCode) ??
        this.normalizeOptionalString(data?.bank_name);

      return {
        resolved: Boolean(this.normalizeOptionalString(data?.account_name)),
        accountNumber: payload.destinationAccountNumber,
        accountName: this.normalizeOptionalString(data?.account_name),
        bankCode,
        bankName,
        currency: payload.currency,
        provider: this.provider,
        message: this.normalizeOptionalString(data?.response_message) ?? 'Account resolved.',
        metadata: data,
      };
    } catch (error) {
      if (this.isFlutterwaveSandboxResolutionLimit(error)) {
        return this.buildSandboxAccountResolutionResult(payload, bankCode);
      }

      return {
        resolved: false,
        accountNumber: payload.destinationAccountNumber,
        accountName: null,
        bankCode,
        bankName: payload.destinationBankName ?? this.findBankNameByCode(bankCode),
        currency: payload.currency,
        provider: this.provider,
        message:
          (error as Error)?.message ??
          'We could not validate this destination account right now.',
      };
    }
  }

  async validateUtilityCustomer(
    payload: ProviderUtilityValidationPayload,
  ): Promise<ProviderUtilityValidationResult> {
    const resolved = this.resolveValidationRoute(payload);
    if (!resolved.itemCode) {
      return {
        valid: false,
        validationAvailable: false,
        resolvedName: null,
        customerReference: payload.customerReference,
        provider: {
          code: payload.providerCode ?? null,
          title: payload.providerTitle ?? null,
          billerCode: resolved.billerCode,
          itemCode: null,
          type: resolved.type,
        },
        fee: null,
        minimumAmount: null,
        maximumAmount: null,
        currency: Currency.NGN,
        message:
          'A utility item code is required before the backend can validate this customer reference.',
        metadata: null,
      };
    }

    try {
      const validation = await this.validateBillItem(
        resolved.itemCode,
        payload.customerReference,
      );
      const data = (validation?.data ?? validation ?? {}) as Record<string, any>;
      const validationMessage =
        this.normalizeOptionalString(data?.response_message) ??
        'Customer validation did not succeed.';
      const isValid =
        String(data?.response_code ?? '').trim() === '00' ||
        String(data?.response_message ?? '')
          .toLowerCase()
          .includes('success');

      if (!isValid && this.isUtilityValidationUnavailableMessage(validationMessage)) {
        return {
          valid: false,
          validationAvailable: false,
          resolvedName: null,
          customerReference: payload.customerReference,
          provider: {
            code: payload.providerCode ?? null,
            title: payload.providerTitle ?? null,
            billerCode: this.normalizeOptionalString(
              data?.biller_code ?? resolved.billerCode,
            ),
            itemCode: this.normalizeOptionalString(
              data?.product_code ?? resolved.itemCode,
            ),
            type: resolved.type,
          },
          fee: this.toNullableNumber(data?.fee),
          minimumAmount: this.toNullableNumber(data?.minimum),
          maximumAmount: this.toNullableNumber(data?.maximum),
          currency: Currency.NGN,
          message: API_MESSAGES.UTILITY_VALIDATION_UNAVAILABLE,
          metadata: {
            rawResponseCode: this.normalizeOptionalString(data?.response_code),
            providerMessage: validationMessage,
          },
        };
      }

      return {
        valid: isValid,
        validationAvailable: true,
        resolvedName: this.normalizeOptionalString(data?.name),
        customerReference: payload.customerReference,
        provider: {
          code: payload.providerCode ?? null,
          title: payload.providerTitle ?? null,
          billerCode: this.normalizeOptionalString(
            data?.biller_code ?? resolved.billerCode,
          ),
          itemCode: this.normalizeOptionalString(
            data?.product_code ?? resolved.itemCode,
          ),
          type: resolved.type,
        },
        fee: this.toNullableNumber(data?.fee),
        minimumAmount: this.toNullableNumber(data?.minimum),
        maximumAmount: this.toNullableNumber(data?.maximum),
        currency: Currency.NGN,
        message: isValid ? 'Customer validated' : validationMessage,
        metadata: {
          address: this.normalizeOptionalString(data?.address),
          email: this.normalizeOptionalString(data?.email),
          rawResponseCode: this.normalizeOptionalString(data?.response_code),
        },
      };
    } catch (error) {
      if (
        error instanceof ServiceUnavailableException ||
        this.isUtilityValidationUnavailableMessage((error as Error)?.message)
      ) {
        return {
          valid: false,
          validationAvailable: false,
          resolvedName: null,
          customerReference: payload.customerReference,
          provider: {
            code: payload.providerCode ?? null,
            title: payload.providerTitle ?? null,
            billerCode: resolved.billerCode,
            itemCode: resolved.itemCode,
            type: resolved.type,
          },
          fee: null,
          minimumAmount: null,
          maximumAmount: null,
          currency: Currency.NGN,
          message: API_MESSAGES.UTILITY_VALIDATION_UNAVAILABLE,
          metadata: null,
        };
      }

      return {
        valid: false,
        validationAvailable: true,
        resolvedName: null,
        customerReference: payload.customerReference,
        provider: {
          code: payload.providerCode ?? null,
          title: payload.providerTitle ?? null,
          billerCode: resolved.billerCode,
          itemCode: resolved.itemCode,
          type: resolved.type,
        },
        fee: null,
        minimumAmount: null,
        maximumAmount: null,
        currency: Currency.NGN,
        message:
          (error as Error)?.message ??
          'We could not validate this customer reference.',
        metadata: null,
      };
    }
  }

  async getCardTopUpStatus(
    reference: string,
  ): Promise<ProviderCardTopUpStatus | null> {
    try {
      const response = await this.flutterwaveRequest<{
        data?: Record<string, any>;
      }>(
        'GET',
        `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`,
      );

      const data = (response?.data ?? response ?? {}) as Record<string, any>;
      const providerStatus = this.mapCheckoutVerificationStatus(data?.status);

      return {
        reference,
        status: providerStatus,
        provider: this.provider,
        amount: this.toNullableNumber(data?.amount ?? data?.charged_amount),
        currency:
          (this.normalizeOptionalString(data?.currency)?.toUpperCase() as Currency) ??
          null,
        providerReference: this.normalizeOptionalString(
          data?.flw_ref ?? data?.tx_ref,
        ),
        externalReference: this.normalizeOptionalString(data?.id),
        message:
          providerStatus === 'SUCCESS'
            ? 'Provider payment completed. Awaiting wallet reconciliation.'
            : providerStatus === 'FAILED'
              ? 'Provider payment failed.'
              : providerStatus === 'CANCELED'
                ? 'Provider payment was canceled.'
                : 'Provider payment is still pending confirmation.',
        creditedAt:
          this.normalizeOptionalString(
            data?.charged_at ?? data?.created_at ?? data?.paid_at,
          ) ?? null,
        checkoutUrl: null,
        redirectUrl: null,
      };
    } catch (error) {
      this.logger.warn(
        `Flutterwave top-up status lookup failed for ${reference}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  async provisionReceiveRails(
    user: User,
    wallets: Wallet[],
  ): Promise<ProviderWalletRail[]> {
    const ngnWallets = wallets.filter((wallet) => wallet.currency === Currency.NGN);

    return Promise.all(
      ngnWallets.map(async (wallet) => {
        const txRef =
          wallet.providerReference ?? this.buildReceiveRailReference(wallet, user);

        if (
          wallet.accountNumber &&
          wallet.bankName &&
          wallet.providerReference &&
          wallet.routingProvider === this.provider
        ) {
          return this.mapExistingRail(wallet);
        }

        const missingRequirements = this.buildMissingRailIdentityRequirements(user);
        if (missingRequirements.length) {
          this.logger.log(
            `Flutterwave rail provisioning deferred for wallet ${wallet.id}: missing ${missingRequirements.join(', ')}`,
          );

          return this.buildProvisioningRail(wallet, user, txRef, {
            state: 'DEFERRED',
            message: API_MESSAGES.NG_RECEIVE_RAIL_REQUIRES_IDENTITY,
            additionalMetadata: {
              missingRequirements,
              requirements: {
                nin: !missingRequirements.includes('NIN'),
                bvn: !missingRequirements.includes('BVN'),
              },
              permanentAccountRequires: ['NIN', 'BVN'],
            },
          });
        }

        const payload = this.buildVirtualAccountPayload(user, txRef);

        try {
          const response = await this.flutterwaveRequest<{
            data?: Record<string, any>;
          }>('POST', '/virtual-account-numbers', payload);
          const data = (response?.data ?? response ?? {}) as Record<string, any>;
          const accountNumber = this.normalizeOptionalString(data?.account_number);
          const state: RailProvisioningState = accountNumber ? 'READY' : 'PENDING';

          return this.buildProvisioningRail(wallet, user, txRef, {
            state,
            message:
              state === 'PENDING' ? API_MESSAGES.NG_RECEIVE_RAIL_PENDING : null,
            accountNumber,
            accountName:
              this.normalizeOptionalString(
                data?.account_name ?? data?.account_status,
              ) ?? this.buildAccountName(user),
            bankName: this.normalizeOptionalString(data?.bank_name) ?? 'Flutterwave',
            sortCode: data?.order_ref ? String(data.order_ref) : txRef,
            providerCustomerId: this.extractProviderCustomerId(data, user),
            providerAccountId: data?.order_ref ? String(data.order_ref) : txRef,
            providerVirtualAccountId: data?.flw_ref
              ? String(data.flw_ref)
              : txRef,
            additionalMetadata: {
              orderRef: data?.order_ref ?? null,
              flwRef: data?.flw_ref ?? null,
              note: data?.note ?? null,
              accountStatus: data?.account_status ?? null,
              responseCode: data?.response_code ?? null,
              isPermanent: true,
              rawProviderResponse: data,
            },
          });
        } catch (error) {
          const typedError = error as Error;
          const resolvedError = this.resolveRailProvisioningError(typedError);
          this.logger.warn(
            `Flutterwave rail provisioning failed for wallet ${wallet.id}: ${typedError.message}`,
          );

          return this.buildProvisioningRail(wallet, user, txRef, {
            state: resolvedError.state,
            message: resolvedError.message,
            additionalMetadata: {
              providerError: typedError.message,
            },
          });
        }
      }),
    );
  }

  async createExternalTransfer(
    payload: ExternalTransferPayload,
  ): Promise<ProviderOperationExecution> {
    const bankCode = await this.resolveBankCode(payload);
    if (!bankCode) {
      throw new BadRequestException(
        'Flutterwave bank code is required for NG external transfers.',
      );
    }

    if (this.isFlutterwaveSandboxMode() && bankCode !== '044') {
      throw new BadRequestException(
        API_MESSAGES.FLW_SANDBOX_BANK_RESOLUTION_LIMIT,
      );
    }

    const reference = this.buildOperationReference('trf', payload.wallet.id);
    const response = await this.flutterwaveRequest<{
      data?: Record<string, any>;
      message?: string;
      status?: string;
    }>('POST', '/transfers', {
      account_bank: bankCode,
      account_number: payload.destinationAccountNumber,
      amount: payload.amount,
      narration:
        payload.narration ??
        `VidalPay external transfer ${payload.destinationAccountNumber}`,
      currency: payload.currency,
      reference,
      debit_currency: payload.currency,
      beneficiary_name:
        payload.destinationAccountName ?? this.buildAccountName(payload.user),
      callback_url: this.getWebhookCallbackUrl(),
      meta: payload.metadata ?? {},
    });

    const data = (response?.data ?? response ?? {}) as Record<string, any>;
    return {
      provider: this.provider,
      operationType: ProviderOperationType.EXTERNAL_TRANSFER,
      status: this.mapTransferStatus(data?.status),
      reference: String(data?.reference ?? reference),
      externalReference: String(data?.id ?? data?.flutter_reference ?? ''),
      responsePayload: data ?? null,
      metadata: {
        destinationBankCode: bankCode,
        destinationBankName: payload.destinationBankName ?? null,
      },
    };
  }

  async createCardTopUpIntent(
    payload: CardTopUpIntentPayload,
  ): Promise<ProviderCardTopUpIntentExecution> {
    const reference = this.buildCardTopUpReference(payload.wallet, payload.user);
    const redirectUrl =
      payload.redirectUrl ?? this.getDefaultPaymentRedirectUrl() ?? null;
    const customerName = this.buildAccountName(payload.user);

    const response = await this.flutterwaveRequest<{
      data?: Record<string, any>;
      message?: string;
      status?: string;
    }>('POST', '/payments', {
      tx_ref: reference,
      amount: payload.amount,
      currency: payload.currency,
      redirect_url: redirectUrl,
      payment_options: 'card',
      customer: {
        email: payload.user.email,
        phonenumber: payload.user.phoneNumber ?? undefined,
        name: customerName,
      },
      customizations: {
        title: 'VidalPay Wallet Top-up',
        description: `Fund your ${payload.currency} wallet securely`,
      },
      meta: {
        ...(payload.metadata ?? {}),
        walletId: payload.wallet.id,
        userId: payload.user.id,
      },
    });

    const data = (response?.data ?? response ?? {}) as Record<string, any>;

    return {
      provider: this.provider,
      operationType: ProviderOperationType.CARD_TOPUP,
      status: ProviderOperationStatus.PENDING,
      reference,
      externalReference: String(data?.id ?? data?.flw_ref ?? ''),
      checkoutUrl: String(data?.link ?? data?.checkout_url ?? ''),
      redirectUrl,
      expiresAt: null,
      responsePayload: data ?? null,
      metadata: {
        fundingSource: 'CARD',
        redirectUrl,
      },
    };
  }

  async purchaseAirtime(
    payload: ProviderProductPayload,
  ): Promise<ProviderOperationExecution> {
    const { billerCode, itemCode, type } = this.resolveBillRoute(
      ProviderOperationType.AIRTIME,
      payload,
    );

    const reference = this.buildOperationReference('airtime', payload.wallet.id);
    const response = await this.flutterwaveRequest<{
      data?: Record<string, any>;
    }>(
      'POST',
      `/billers/${encodeURIComponent(billerCode)}/items/${encodeURIComponent(itemCode)}/payment`,
      {
        amount: payload.amount,
        country: this.region,
        customer: payload.phoneNumber,
        reference,
        recurrence: 'ONCE',
        callback_url: this.getWebhookCallbackUrl(),
        type,
      },
    );

    const data = (response?.data ?? response ?? {}) as Record<string, any>;
    return {
      provider: this.provider,
      operationType: ProviderOperationType.AIRTIME,
      status: this.mapBillStatus(data?.status ?? data?.Status),
      reference,
      externalReference: String(
        data?.id ??
          data?.payment_reference ??
          data?.PaymentReference ??
          data?.flw_ref ??
          '',
      ),
      responsePayload: data ?? null,
      metadata: {
        billerCode,
        itemCode,
        type,
      },
    };
  }

  async purchaseData(
    payload: ProviderProductPayload,
  ): Promise<ProviderOperationExecution> {
    const { billerCode, itemCode, type } = this.resolveBillRoute(
      ProviderOperationType.DATA,
      payload,
    );

    const reference = this.buildOperationReference('data', payload.wallet.id);
    const response = await this.flutterwaveRequest<{
      data?: Record<string, any>;
    }>(
      'POST',
      `/billers/${encodeURIComponent(billerCode)}/items/${encodeURIComponent(itemCode)}/payment`,
      {
        amount: payload.amount,
        country: this.region,
        customer: payload.phoneNumber,
        reference,
        recurrence: 'ONCE',
        callback_url: this.getWebhookCallbackUrl(),
        type,
      },
    );

    const data = (response?.data ?? response ?? {}) as Record<string, any>;
    return {
      provider: this.provider,
      operationType: ProviderOperationType.DATA,
      status: this.mapBillStatus(data?.status ?? data?.Status),
      reference,
      externalReference: String(
        data?.id ??
          data?.payment_reference ??
          data?.PaymentReference ??
          data?.flw_ref ??
          '',
      ),
      responsePayload: data ?? null,
      metadata: {
        billerCode,
        itemCode,
        type,
      },
    };
  }

  async payUtility(
    payload: ProviderProductPayload,
  ): Promise<ProviderOperationExecution> {
    const { billerCode, itemCode, type } = this.resolveBillRoute(
      ProviderOperationType.UTILITY,
      payload,
    );

    const reference = this.buildOperationReference('utility', payload.wallet.id);
    const response = await this.flutterwaveRequest<{
      data?: Record<string, any>;
    }>(
      'POST',
      `/billers/${encodeURIComponent(billerCode)}/items/${encodeURIComponent(itemCode)}/payment`,
      {
        amount: payload.amount,
        country: this.region,
        customer: payload.customerReference,
        reference,
        recurrence: 'ONCE',
        callback_url: this.getWebhookCallbackUrl(),
        type,
      },
    );

    const data = (response?.data ?? response ?? {}) as Record<string, any>;
    return {
      provider: this.provider,
      operationType: ProviderOperationType.UTILITY,
      status: this.mapBillStatus(data?.status ?? data?.Status),
      reference,
      externalReference: String(
        data?.id ??
          data?.payment_reference ??
          data?.PaymentReference ??
          data?.flw_ref ??
          '',
      ),
      responsePayload: data ?? null,
      metadata: {
        billerCode,
        itemCode,
        type,
      },
    };
  }

  async handleWebhook(
    payload: Record<string, any>,
    headers?: Record<string, string | string[] | undefined>,
  ): Promise<ProviderWebhookExecution> {
    this.verifyWebhookSignature(headers);

    const eventType = String(payload.event ?? payload.type ?? 'flutterwave.unknown');
    const data = (payload.data ?? {}) as Record<string, any>;

    if (
      eventType === 'charge.completed' &&
      String(data.status ?? '').toLowerCase() === 'successful'
    ) {
      const verified = await this.verifyTransaction(data);
      const verifiedData = verified?.data ?? verified ?? data;
      const txRef = String(verifiedData?.tx_ref ?? data?.tx_ref ?? '');
      const fundingTarget = await this.resolveFundingTarget(txRef);
      const paymentType = String(
        verifiedData?.payment_type ?? data?.payment_type ?? 'unknown',
      ).toLowerCase();

      return {
        provider: this.provider,
        eventType,
        eventReference: String(
          verifiedData?.flw_ref ?? data?.flw_ref ?? verifiedData?.id ?? '',
        ) || null,
        operationReference: txRef || null,
        operationStatus: ProviderOperationStatus.COMPLETED,
        processed: true,
        metadata: fundingTarget
          ? {
              walletCredit: {
                userId: fundingTarget.userId,
                walletId: fundingTarget.walletId,
                currency: fundingTarget.currency,
                amount: Number(
                  verifiedData?.amount_settled ??
                    verifiedData?.charged_amount ??
                    verifiedData?.amount ??
                    0,
                ),
                reference: String(
                  verifiedData?.flw_ref ?? data?.flw_ref ?? txRef ?? '',
                ),
                info: `Wallet funding via Flutterwave ${paymentType.replace(/_/g, ' ')}`,
                description: `Flutterwave ${paymentType.replace(/_/g, ' ')} funding (${txRef})`,
              },
              paymentType,
            }
          : {
              fundingReference: txRef,
              fundingTargetResolved: false,
              paymentType,
            },
      };
    }

    if (eventType === 'transfer.disburse') {
      const transferData = data;
      return {
        provider: this.provider,
        eventType,
        eventReference: String(
          transferData?.id ?? transferData?.reference ?? '',
        ) || null,
        operationReference: String(transferData?.reference ?? '') || null,
        operationStatus: this.mapTransferStatus(transferData?.status),
        processed: true,
        metadata: {
          transferId: transferData?.id ?? null,
        },
      };
    }

    if (eventType === 'singlebillpayment.status') {
      return {
        provider: this.provider,
        eventType,
        eventReference: String(
          data?.flw_ref ?? data?.PaymentReference ?? data?.tx_ref ?? '',
        ) || null,
        operationReference:
          String(data?.tx_ref ?? data?.reference ?? data?.Reference ?? '') || null,
        operationStatus: this.mapBillStatus(data?.status ?? data?.Status),
        processed: true,
        metadata: {
          paymentReference: data?.PaymentReference ?? data?.flw_ref ?? null,
          customer: data?.customer ?? null,
        },
      };
    }

    return {
      provider: this.provider,
      eventType,
      eventReference: String(data?.id ?? data?.flw_ref ?? '') || null,
      operationReference:
        String(data?.reference ?? data?.tx_ref ?? data?.flw_ref ?? '') || null,
      operationStatus: ProviderOperationStatus.PROCESSING,
      processed: false,
      ignored: true,
      metadata: {
        ignored: true,
      },
    };
  }

  private async getCachedCatalog<T>(
    key: string,
    loader: () => Promise<T>,
  ): Promise<T> {
    const now = Date.now();
    const cached = this.catalogCache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.value as T;
    }

    const value = await loader();
    this.catalogCache.set(key, {
      expiresAt: now + this.catalogCacheTtlMs,
      value,
    });
    return value;
  }

  private async buildAirtimeCatalogFromFlutterwave(
    billers: FlutterwaveBiller[],
  ): Promise<ProviderAirtimeCatalog['networks']> {
    const networks: ProviderAirtimeCatalog['networks'] = [];

    for (const biller of billers) {
      const billerCode = this.normalizeOptionalString(biller.biller_code);
      if (!billerCode) {
        continue;
      }

      const items = await this.fetchBillItems(billerCode);
      if (!items.length) {
        const networkTitle = this.normalizeCatalogTitle(
          biller.short_name ?? biller.name,
        );
        if (!networkTitle) {
          continue;
        }

        networks.push({
          id: this.toCatalogId(networkTitle),
          code: this.toCatalogCode(networkTitle),
          title: networkTitle,
          description: `Buy airtime for ${networkTitle} numbers.`,
          billerCode,
          itemCode: null,
          serviceCode: null,
          currency: Currency.NGN,
          minAmount: 50,
          maxAmount: 50000,
          enabled: false,
        });
        continue;
      }

      for (const item of items) {
        const networkTitle = this.normalizeCatalogTitle(
          item.short_name ?? item.name ?? biller.short_name ?? biller.name,
        );
        if (!networkTitle) {
          continue;
        }

        const normalizedBillerCode =
          this.normalizeOptionalString(item.biller_code) ?? billerCode;
        const itemCode = this.normalizeOptionalString(item.item_code);
        const type = this.normalizeOptionalString(item.name) ?? 'AIRTIME';

        networks.push({
          id: this.toCatalogId(networkTitle),
          code: this.toCatalogCode(networkTitle),
          title: networkTitle,
          description: `Buy airtime for ${networkTitle} numbers.`,
          billerCode: normalizedBillerCode,
          itemCode,
          serviceCode: this.buildServiceCode(
            normalizedBillerCode,
            itemCode,
            type,
          ),
          currency: Currency.NGN,
          minAmount: this.toNullableNumber(item.minimum) ?? 50,
          maxAmount: this.toNullableNumber(item.maximum) ?? 50000,
          enabled: Boolean(normalizedBillerCode && itemCode),
        });
      }
    }

    return this.uniqueBy(networks, (network) => network.id);
  }

  private async buildDataCatalogFromFlutterwave(
    billers: FlutterwaveBiller[],
  ): Promise<ProviderDataCatalog['networks']> {
    const networks: ProviderDataCatalog['networks'] = [];

    for (const biller of billers) {
      const billerCode = this.normalizeOptionalString(biller.biller_code);
      if (!billerCode) {
        continue;
      }

      const networkTitle = this.normalizeCatalogTitle(
        biller.short_name ?? biller.name,
      );
      if (!networkTitle) {
        continue;
      }

      const items = await this.fetchBillItems(billerCode);
      const plans = items
        .map((item) => {
          const itemCode = this.normalizeOptionalString(item.item_code);
          const type = this.normalizeOptionalString(item.name);
          const title = this.normalizeCatalogTitle(item.short_name ?? item.name);
          if (!title) {
            return null;
          }

          return {
            id: this.toCatalogId(`${networkTitle}-${itemCode ?? title}`),
            code: this.toCatalogCode(title),
            title,
            description:
              this.normalizeOptionalString(item.label_name) ??
              `Data bundle for ${networkTitle}.`,
            amount: this.toNullableNumber(item.amount),
            currency: Currency.NGN,
            serviceCode: this.buildServiceCode(billerCode, itemCode, type),
            billerCode,
            itemCode,
            type,
            enabled: Boolean(billerCode && itemCode && type),
          };
        })
        .filter(Boolean);

      networks.push({
        id: this.toCatalogId(networkTitle),
        code: this.toCatalogCode(networkTitle),
        title: networkTitle,
        description: `${networkTitle} mobile data bundles.`,
        billerCode,
        plans: plans as ProviderDataCatalog['networks'][number]['plans'],
      });
    }

    return networks.filter((network) => network.plans.length > 0);
  }

  private async buildUtilitiesCatalogFromFlutterwave(): Promise<
    ProviderUtilitiesCatalog['categories']
  > {
    const categoryBlueprints = [
      {
        id: 'electricity',
        code: FLUTTERWAVE_BILL_CATEGORY_CODES.utilities,
        title: 'Electricity',
        description: 'Pay prepaid and postpaid electricity bills.',
        type: 'POWER',
        defaultReferenceLabel: 'Meter Number',
      },
      {
        id: 'tv',
        code: FLUTTERWAVE_BILL_CATEGORY_CODES.cable,
        title: 'Cable & TV',
        description: 'Renew cable and satellite subscriptions.',
        type: 'CABLE',
        defaultReferenceLabel: 'Smartcard Number',
      },
      {
        id: 'internet',
        code: FLUTTERWAVE_BILL_CATEGORY_CODES.internet,
        title: 'Internet / Broadband',
        description: 'Handle broadband and internet account renewals.',
        type: 'INTERNET',
        defaultReferenceLabel: 'Account Number',
      },
    ] as const;

    const categories: ProviderUtilitiesCatalog['categories'] = [];

    for (const category of categoryBlueprints) {
      const billers = await this.fetchBillersByCategory(category.code);
      const providers = await Promise.all(
        billers.map(async (biller) => {
          const billerCode = this.normalizeOptionalString(biller.biller_code);
          if (!billerCode) {
            return null;
          }

          const providerTitle = this.normalizeCatalogTitle(
            biller.short_name ?? biller.name,
          );
          if (!providerTitle) {
            return null;
          }

          const items = await this.fetchBillItems(billerCode);
          const normalizedItems = items
            .map((item) => {
              const itemCode = this.normalizeOptionalString(item.item_code);
              const title = this.normalizeCatalogTitle(
                item.short_name ?? item.name,
              );
              if (!title) {
                return null;
              }

              const type =
                this.normalizeOptionalString(item.name) ?? category.type;
              const customerReferenceLabel =
                this.normalizeOptionalString(item.label_name) ??
                category.defaultReferenceLabel;

              return {
                id: this.toCatalogId(`${providerTitle}-${itemCode ?? title}`),
                code: this.toCatalogCode(title),
                title,
                description:
                  this.normalizeOptionalString(item.label_name) ??
                  `${providerTitle} bill payment`,
                amount: this.toNullableNumber(item.amount),
                currency: Currency.NGN,
                serviceCode: this.buildServiceCode(billerCode, itemCode, type),
                billerCode,
                itemCode,
                type,
                requiresValidation: true,
                customerReferenceLabel,
                enabled: Boolean(billerCode && itemCode),
              };
            })
            .filter(Boolean) as ProviderUtilitiesCatalog['categories'][number]['providers'][number]['items'];

          const primaryItem = normalizedItems[0] ?? null;

          return {
            id: this.toCatalogId(providerTitle),
            code: this.toCatalogCode(providerTitle),
            title: providerTitle,
            description:
              this.normalizeOptionalString(biller.description) ??
              `${providerTitle} bill payments.`,
            billerCode,
            itemCode: primaryItem?.itemCode ?? null,
            type: category.type,
            requiresValidation: true,
            customerReferenceLabel:
              primaryItem?.customerReferenceLabel ??
              category.defaultReferenceLabel,
            currency: Currency.NGN,
            enabled: normalizedItems.some((item) => item.enabled),
            items: normalizedItems,
          };
        }),
      );

      categories.push({
        id: category.id,
        code: this.toCatalogCode(category.title),
        title: category.title,
        description: category.description,
        providers: providers.filter(Boolean) as ProviderUtilitiesCatalog['categories'][number]['providers'],
      });
    }

    return categories.filter((category) => category.providers.length > 0);
  }

  private async fetchBillersByCategory(
    categoryCode: string,
  ): Promise<FlutterwaveBiller[]> {
    const response = await this.flutterwaveRequest<{
      data?: FlutterwaveBiller[];
    }>(
      'GET',
      `/bills/${encodeURIComponent(categoryCode)}/billers?country=${this.region}`,
    );

    return Array.isArray(response?.data) ? response.data : [];
  }

  private async fetchBillItems(
    billerCode: string,
  ): Promise<FlutterwaveBillItem[]> {
    const response = await this.flutterwaveRequest<{
      data?: FlutterwaveBillItem[];
    }>('GET', `/billers/${encodeURIComponent(billerCode)}/items`);

    return Array.isArray(response?.data) ? response.data : [];
  }

  private async validateBillItem(
    itemCode: string,
    customerReference: string,
  ): Promise<{ data?: Record<string, any> }> {
    const attempts = [
      `/bill-items/${encodeURIComponent(itemCode)}/validate?code=${encodeURIComponent(customerReference)}`,
      `/bill-items/${encodeURIComponent(itemCode)}/validate?customer=${encodeURIComponent(customerReference)}`,
      `/bill-items/${encodeURIComponent(itemCode)}/validate?customer_id=${encodeURIComponent(customerReference)}`,
    ];

    let lastError: unknown = null;

    for (const path of attempts) {
      try {
        return await this.flutterwaveRequest<{ data?: Record<string, any> }>(
          'GET',
          path,
        );
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }

  private resolveValidationRoute(payload: ProviderUtilityValidationPayload) {
    const codeParts = String(payload.serviceCode ?? '')
      .split(':')
      .map((part) => part.trim())
      .filter(Boolean);

    return {
      billerCode:
        this.normalizeOptionalString(payload.billerCode) ??
        this.normalizeOptionalString(codeParts[0]),
      itemCode:
        this.normalizeOptionalString(payload.itemCode) ??
        this.normalizeOptionalString(codeParts[1]),
      type:
        this.normalizeOptionalString(payload.type) ??
        this.normalizeOptionalString(codeParts[2]),
    };
  }

  private mapExistingRail(wallet: Wallet): ProviderWalletRail {
    const provisioningState =
      this.normalizeProvisioningState(wallet.providerMetadata?.provisioningState) ??
      (wallet.accountNumber ? 'READY' : 'PENDING');

    return {
      walletId: wallet.id,
      currency: wallet.currency,
      provider: this.provider,
      region: this.region,
      railType: 'VIRTUAL_ACCOUNT',
      accountNumber: wallet.accountNumber ?? null,
      routingNumber: wallet.routingNumber ?? null,
      accountName: wallet.accountName ?? null,
      bankName: wallet.bankName ?? null,
      sortCode: wallet.sortCode ?? null,
      providerCustomerId: wallet.providerCustomerId ?? null,
      providerAccountId: wallet.providerAccountId ?? null,
      providerVirtualAccountId: wallet.providerVirtualAccountId ?? null,
      providerReference: wallet.providerReference ?? null,
      providerMetadata: {
        ...(wallet.providerMetadata ?? {}),
        provisioningState,
        provisioningDeferred: provisioningState === 'DEFERRED',
        provisioningError:
          provisioningState === 'READY'
            ? null
            : wallet.providerMetadata?.provisioningError ?? null,
      },
    };
  }

  private buildBankCatalogResponse(
    banks: ProviderBankCatalog['banks'],
    source: ProviderBankCatalog['source'],
  ): ProviderBankCatalog {
    if (!this.isFlutterwaveSandboxMode()) {
      return {
        region: this.region,
        provider: this.provider,
        source,
        message: source === 'PROVIDER' ? null : FLUTTERWAVE_BANK_FALLBACK_CATALOG.message,
        banks,
      };
    }

    const accessBank =
      banks.find((bank) => bank.code === '044') ??
      FLUTTERWAVE_BANK_FALLBACK_CATALOG.banks.find((bank) => bank.code === '044') ??
      null;

    return {
      region: this.region,
      provider: this.provider,
      source: 'CURATED_FALLBACK',
      message: API_MESSAGES.FLW_SANDBOX_BANK_RESOLUTION_LIMIT,
      banks: accessBank
        ? [
            {
              ...accessBank,
              enabled: true,
              metadata: {
                ...(accessBank.metadata ?? {}),
                sandboxOnly: true,
                supportedTestAccounts: [
                  '0690000031',
                  '0690000032',
                  '0690000033',
                  '0690000034',
                ],
              },
            },
          ]
        : [],
    };
  }

  private buildSandboxAccountResolutionResult(
    payload: ProviderAccountResolutionPayload,
    bankCode: string,
  ): ProviderAccountResolutionResult {
    return {
      resolved: false,
      accountNumber: payload.destinationAccountNumber,
      accountName: null,
      bankCode,
      bankName: this.findBankNameByCode(bankCode),
      currency: payload.currency,
      provider: this.provider,
      message: API_MESSAGES.FLW_SANDBOX_BANK_RESOLUTION_LIMIT,
      metadata: {
        sandboxOnly: true,
        supportedBankCodes: ['044'],
      },
    };
  }

  private buildProvisioningRail(
    wallet: Wallet,
    user: User,
    txRef: string,
    input: {
      state: RailProvisioningState;
      message: string | null;
      accountNumber?: string | null;
      routingNumber?: string | null;
      accountName?: string | null;
      bankName?: string | null;
      sortCode?: string | null;
      providerCustomerId?: string | null;
      providerAccountId?: string | null;
      providerVirtualAccountId?: string | null;
      additionalMetadata?: Record<string, any> | null;
    },
  ): ProviderWalletRail {
    return {
      walletId: wallet.id,
      currency: wallet.currency,
      provider: this.provider,
      region: this.region,
      railType: 'VIRTUAL_ACCOUNT',
      accountNumber:
        input.accountNumber !== undefined
          ? input.accountNumber
          : wallet.accountNumber ?? null,
      routingNumber:
        input.routingNumber !== undefined
          ? input.routingNumber
          : wallet.routingNumber ?? null,
      accountName:
        input.accountName !== undefined
          ? input.accountName
          : wallet.accountName ?? this.buildAccountName(user),
      bankName:
        input.bankName !== undefined ? input.bankName : wallet.bankName ?? null,
      sortCode:
        input.sortCode !== undefined ? input.sortCode : wallet.sortCode ?? null,
      providerCustomerId:
        input.providerCustomerId ?? wallet.providerCustomerId ?? null,
      providerAccountId: input.providerAccountId ?? wallet.providerAccountId ?? null,
      providerVirtualAccountId:
        input.providerVirtualAccountId ?? wallet.providerVirtualAccountId ?? null,
      providerReference: wallet.providerReference ?? txRef,
      providerMetadata: {
        ...(wallet.providerMetadata ?? {}),
        bankTransferReference: txRef,
        provisioningState: input.state,
        provisioningDeferred: input.state === 'DEFERRED',
        provisioningError: input.state === 'READY' ? null : input.message,
        lastProvisioningAttemptAt: new Date().toISOString(),
        ...(input.additionalMetadata ?? {}),
      },
    };
  }

  private buildVirtualAccountPayload(user: User, txRef: string) {
    const identity = user.kyc?.identityData ?? {};
    const payload: Record<string, any> = {
      email: user.email,
      tx_ref: txRef,
      amount: 0,
      is_permanent: true,
      firstname: user.firstName ?? 'Vidal',
      lastname: user.lastName ?? 'User',
      phonenumber: user.phoneNumber ?? undefined,
      narration: `VidalPay receive account for ${this.buildAccountName(user)}`,
    };

    if (identity?.bvn) {
      payload.bvn = identity.bvn;
    }
    if (identity?.nin) {
      payload.nin = identity.nin;
    }

    return payload;
  }

  private buildReceiveRailReference(wallet: Wallet, user: User) {
    return `VIDAL_FLW_RAIL_${wallet.id}_${user.id}`;
  }

  private buildOperationReference(prefix: string, walletId: string) {
    return `VIDAL_FLW_${prefix.toUpperCase()}_${walletId}_${Date.now()}`;
  }

  private buildCardTopUpReference(wallet: Wallet, user: User) {
    return `VIDAL_FLW_TOPUP_${wallet.id}_${user.id}_${Date.now()}`;
  }

  private buildAccountName(user: User) {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return fullName || user.email;
  }

  private extractProviderCustomerId(data: Record<string, any>, user: User) {
    return String(
      data?.customer?.id ??
        data?.customer?.customer_id ??
        data?.customer_id ??
        `flw_cus_${user.id}`,
    );
  }

  private buildMissingRailIdentityRequirements(user: User) {
    const identity = user.kyc?.identityData ?? {};
    const missingRequirements: string[] = [];

    if (!this.normalizeOptionalString(identity?.nin)) {
      missingRequirements.push('NIN');
    }

    if (!this.normalizeOptionalString(identity?.bvn)) {
      missingRequirements.push('BVN');
    }

    return missingRequirements;
  }

  private resolveRailProvisioningError(error: Error): {
    state: RailProvisioningState;
    message: string;
  } {
    const normalized = String(error?.message ?? '').toLowerCase();

    if (normalized.includes('nin') || normalized.includes('bvn')) {
      return {
        state: 'DEFERRED',
        message: API_MESSAGES.NG_RECEIVE_RAIL_REQUIRES_IDENTITY,
      };
    }

    if (
      normalized.includes('processing') ||
      normalized.includes('pending') ||
      normalized.includes('queued')
    ) {
      return {
        state: 'PENDING',
        message: API_MESSAGES.NG_RECEIVE_RAIL_PENDING,
      };
    }

    return {
      state: 'UNAVAILABLE',
      message:
        this.normalizeOptionalString(error?.message) ??
        API_MESSAGES.NG_RECEIVE_RAIL_UNAVAILABLE,
    };
  }

  private normalizeProvisioningState(value: unknown): RailProvisioningState | null {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (
      normalized === 'READY' ||
      normalized === 'PENDING' ||
      normalized === 'DEFERRED' ||
      normalized === 'UNAVAILABLE'
    ) {
      return normalized;
    }

    return null;
  }

  private extractBankCode(
    metadata: Record<string, any> | null | undefined,
    payload: ExternalTransferPayload,
  ): string | null {
    const bankCode =
      payload.destinationBankCode ??
      metadata?.bankCode ??
      metadata?.destinationBankCode ??
      payload.destinationRoutingNumber ??
      null;

    return bankCode ? String(bankCode) : null;
  }

  private async resolveBankCode(
    payload: ExternalTransferPayload,
  ): Promise<string | null> {
    const directBankCode = this.extractBankCode(payload.metadata, payload);
    if (directBankCode) {
      return directBankCode;
    }

    const normalizedBankName = this.normalizeOptionalString(
      payload.destinationBankName,
    )?.toLowerCase();
    if (!normalizedBankName) {
      return null;
    }

    const catalog = await this.getBankCatalog();
    const matchedBank = catalog.banks.find((bank) => {
      const bankName = bank.name.toLowerCase();
      return (
        bankName === normalizedBankName ||
        bankName.includes(normalizedBankName) ||
        normalizedBankName.includes(bankName)
      );
    });

    return matchedBank?.code ?? null;
  }

  private findBankNameByCode(bankCode: string): string | null {
    const cachedCatalog = this.catalogCache.get('banks');
    const banks =
      (cachedCatalog?.value as ProviderBankCatalog | undefined)?.banks ??
      FLUTTERWAVE_BANK_FALLBACK_CATALOG.banks;
    const matchedBank = banks.find((bank) => bank.code === bankCode);
    return matchedBank?.name ?? null;
  }

  private isFlutterwaveSandboxMode() {
    const config = this.getConfig();
    return (
      config.secretKey.includes('_TEST-') ||
      config.baseUrl.toLowerCase().includes('sandbox')
    );
  }

  private isFlutterwaveSandboxResolutionLimit(error: unknown) {
    const message = String((error as Error)?.message ?? '').toLowerCase();
    return message.includes('only 044 is allowed');
  }

  private isUtilityValidationUnavailableMessage(message: string | null | undefined) {
    const normalized = String(message ?? '').trim().toLowerCase();
    if (!normalized) {
      return false;
    }

    return (
      normalized.includes('unknown biller') ||
      normalized.includes('unknown product') ||
      normalized.includes('service unavailable') ||
      normalized.includes('temporarily unavailable') ||
      normalized.includes('not available for validation')
    );
  }

  private resolveBillRoute(
    operationType: ProviderOperationType,
    payload: ProviderProductPayload,
  ) {
    const metadata = payload.metadata ?? {};
    const codeParts = String(payload.serviceCode ?? metadata.serviceCode ?? '')
      .split(':')
      .map((part) => part.trim())
      .filter(Boolean);

    const billerCode = String(
      metadata.billerCode ?? codeParts[0] ?? '',
    ).trim();
    const itemCode = String(
      metadata.itemCode ?? codeParts[1] ?? codeParts[0] ?? '',
    ).trim();
    const type = String(
      metadata.type ??
        codeParts[2] ??
        (operationType === ProviderOperationType.AIRTIME ? 'AIRTIME' : ''),
    ).trim();

    if (!billerCode || !itemCode) {
      throw new BadRequestException(
        'Flutterwave billing codes are required for this NG product.',
      );
    }

    return {
      billerCode,
      itemCode,
      type: type || undefined,
    };
  }

  private mapTransferStatus(status: string | null | undefined) {
    const normalized = String(status ?? '').toUpperCase();
    if (normalized === 'SUCCESSFUL' || normalized === 'SUCCESS') {
      return ProviderOperationStatus.COMPLETED;
    }
    if (normalized === 'FAILED' || normalized === 'FAIL') {
      return ProviderOperationStatus.FAILED;
    }
    if (normalized === 'REVERSED') {
      return ProviderOperationStatus.REVERSED;
    }
    return ProviderOperationStatus.PROCESSING;
  }

  private mapBillStatus(status: string | null | undefined) {
    const normalized = String(status ?? '').toUpperCase();
    if (normalized === 'SUCCESSFUL' || normalized === 'SUCCESS') {
      return ProviderOperationStatus.COMPLETED;
    }
    if (normalized === 'FAILED' || normalized === 'FAIL') {
      return ProviderOperationStatus.FAILED;
    }
    return ProviderOperationStatus.PROCESSING;
  }

  private mapCheckoutVerificationStatus(
    status: string | null | undefined,
  ): ProviderCardTopUpStatus['status'] {
    const normalized = String(status ?? '').trim().toUpperCase();

    if (normalized === 'SUCCESSFUL' || normalized === 'SUCCESS') {
      return 'SUCCESS';
    }

    if (
      normalized === 'FAILED' ||
      normalized === 'FAIL' ||
      normalized === 'ERROR'
    ) {
      return 'FAILED';
    }

    if (normalized === 'CANCELLED' || normalized === 'CANCELED') {
      return 'CANCELED';
    }

    return 'PENDING';
  }

  private toCatalogId(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private toCatalogCode(value: string) {
    return value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private normalizeCatalogTitle(value: string | null | undefined) {
    const normalized = this.normalizeOptionalString(value);
    if (!normalized) {
      return null;
    }

    return normalized
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (match) => match.toUpperCase());
  }

  private normalizeOptionalString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized.length ? normalized : null;
  }

  private toNullableNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return null;
  }

  private buildServiceCode(
    billerCode: string | null,
    itemCode: string | null,
    type?: string | null,
  ) {
    if (!billerCode || !itemCode) {
      return null;
    }

    return [billerCode, itemCode, this.normalizeOptionalString(type)]
      .filter(Boolean)
      .join(':');
  }

  private uniqueBy<T>(values: T[], getKey: (value: T) => string) {
    const seen = new Set<string>();
    return values.filter((value) => {
      const key = getKey(value);
      if (!key || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  private verifyWebhookSignature(
    headers?: Record<string, string | string[] | undefined>,
  ) {
    const config = this.getConfig();
    if (!config.secretHash) {
      throw new ServiceUnavailableException(
        'Flutterwave webhook secret hash is not configured.',
      );
    }

    const headerValue = headers?.['verif-hash'];
    const signature = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (!signature || signature !== config.secretHash) {
      throw new UnauthorizedException('Invalid Flutterwave webhook signature.');
    }
  }

  private async verifyTransaction(payloadData: Record<string, any>) {
    const transactionId = payloadData?.id;
    const txRef = payloadData?.tx_ref;

    if (transactionId) {
      return this.flutterwaveRequest<{ data?: Record<string, any> }>(
        'GET',
        `/transactions/${transactionId}/verify`,
      );
    }

    if (txRef) {
      return this.flutterwaveRequest<{ data?: Record<string, any> }>(
        'GET',
        `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(String(txRef))}`,
      );
    }

    return payloadData;
  }

  private async resolveFundingTarget(txRef: string): Promise<{
    walletId: string;
    userId: string;
    currency: Currency;
  } | null> {
    const railMatch = txRef.match(/^VIDAL_FLW_RAIL_([^_]+)_([^_]+)$/);
    const topUpMatch = txRef.match(/^VIDAL_FLW_TOPUP_([^_]+)_([^_]+)_\d+$/);
    const walletId = railMatch?.[1] ?? topUpMatch?.[1] ?? null;
    const userId = railMatch?.[2] ?? topUpMatch?.[2] ?? null;

    if (!walletId || !userId) {
      return null;
    }

    const wallet = await this.walletRepository.findOne({
      where: {
        id: walletId,
      },
    });

    if (!wallet || wallet.userId !== userId) {
      return null;
    }

    return {
      walletId: wallet.id,
      userId: wallet.userId,
      currency: wallet.currency,
    };
  }

  private getWebhookCallbackUrl() {
    const baseUrl =
      process.env.BACKEND_PUBLIC_URL ??
      process.env.RENDER_EXTERNAL_URL ??
      process.env.API_BASE_URL ??
      '';

    if (!baseUrl) {
      return undefined;
    }

    return `${baseUrl.replace(/\/$/, '')}/api/v1/integrations/webhooks/flutterwave`;
  }

  private getDefaultPaymentRedirectUrl() {
    return (
      process.env.PAYMENT_REDIRECT_URL ??
      process.env.FRONTEND_URL ??
      process.env.APP_URL ??
      this.getWebhookCallbackUrl()
    );
  }

  private getConfig(): FlutterwaveConfig {
    const baseUrl = process.env.FLW_BASE_URL?.replace(/\/$/, '');
    const secretKey = process.env.FLW_SECRET_KEY;
    const secretHash = process.env.FLW_WEBHOOK_SECRET_HASH ?? null;

    if (!baseUrl || !secretKey) {
      throw new ServiceUnavailableException(
        'Flutterwave is not configured for this environment.',
      );
    }

    return {
      baseUrl,
      secretKey,
      secretHash,
    };
  }

  private async flutterwaveRequest<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, any>,
  ): Promise<T> {
    const config = this.getConfig();
    const response = await fetch(`${config.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const raw = await response.text();
    const parsed = raw ? this.safeParseJson(raw) : null;

    if (!response.ok) {
      const reason =
        parsed?.message ??
        parsed?.error?.message ??
        parsed?.data?.message ??
        `Flutterwave request failed with status ${response.status}`;

      throw new BadRequestException(reason);
    }

    return (parsed as T) ?? ({} as T);
  }

  private safeParseJson(raw: string): any {
    try {
      return JSON.parse(raw);
    } catch {
      return {
        raw,
      };
    }
  }
}
