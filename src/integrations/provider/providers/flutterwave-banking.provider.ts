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
  ExternalTransferPayload,
  ProviderOperationExecution,
  ProviderProductPayload,
  ProviderWalletRail,
  ProviderWebhookExecution,
  RegionalProviderAdapter,
} from '../interfaces/regional-provider.interface';

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

  constructor(private readonly walletRepository: WalletRepository) {}

  supportsOperation(operationType: ProviderOperationType): boolean {
    return [
      ProviderOperationType.RAIL_PROVISIONING,
      ProviderOperationType.EXTERNAL_TRANSFER,
      ProviderOperationType.AIRTIME,
      ProviderOperationType.DATA,
      ProviderOperationType.UTILITY,
    ].includes(operationType);
  }

  async provisionReceiveRails(
    user: User,
    wallets: Wallet[],
  ): Promise<ProviderWalletRail[]> {
    const ngnWallets = wallets.filter((wallet) => wallet.currency === Currency.NGN);

    return Promise.all(
      ngnWallets.map(async (wallet) => {
        if (
          wallet.accountNumber &&
          wallet.bankName &&
          wallet.providerReference &&
          wallet.routingProvider === this.provider
        ) {
          return this.mapExistingRail(wallet);
        }

        const txRef = this.buildReceiveRailReference(wallet, user);
        const payload = this.buildVirtualAccountPayload(user, txRef);

        try {
          const response = await this.flutterwaveRequest<{
            data?: Record<string, any>;
          }>('POST', '/virtual-account-numbers', payload);
          const data = (response?.data ?? response ?? {}) as Record<string, any>;

          return {
            walletId: wallet.id,
            currency: wallet.currency,
            provider: this.provider,
            region: this.region,
            railType: 'VIRTUAL_ACCOUNT',
            accountNumber: String(data?.account_number ?? ''),
            routingNumber: null,
            accountName: String(
              data?.account_name ??
                data?.account_status ??
                this.buildAccountName(user),
            ),
            bankName: String(data?.bank_name ?? 'Flutterwave'),
            sortCode: String(data?.order_ref ?? txRef),
            providerCustomerId: this.extractProviderCustomerId(data, user),
            providerAccountId: String(data?.order_ref ?? txRef),
            providerVirtualAccountId: String(data?.flw_ref ?? txRef),
            providerReference: txRef,
            providerMetadata: {
              bankTransferReference: txRef,
              orderRef: data?.order_ref ?? null,
              flwRef: data?.flw_ref ?? null,
              note: data?.note ?? null,
              accountStatus: data?.account_status ?? null,
              responseCode: data?.response_code ?? null,
            },
          };
        } catch (error) {
          const typedError = error as Error;
          this.logger.warn(
            `Flutterwave rail provisioning failed for wallet ${wallet.id}: ${typedError.message}`,
          );

          return {
            walletId: wallet.id,
            currency: wallet.currency,
            provider: this.provider,
            region: this.region,
            railType: 'VIRTUAL_ACCOUNT',
            accountNumber: wallet.accountNumber ?? null,
            routingNumber: wallet.routingNumber ?? null,
            accountName: wallet.accountName ?? this.buildAccountName(user),
            bankName: wallet.bankName ?? null,
            sortCode: wallet.sortCode ?? null,
            providerCustomerId: wallet.providerCustomerId ?? null,
            providerAccountId: wallet.providerAccountId ?? null,
            providerVirtualAccountId: wallet.providerVirtualAccountId ?? null,
            providerReference: wallet.providerReference ?? txRef,
            providerMetadata: {
              ...(wallet.providerMetadata ?? {}),
              bankTransferReference: txRef,
              provisioningError: typedError.message,
              provisioningDeferred: true,
            },
          };
        }
      }),
    );
  }

  async createExternalTransfer(
    payload: ExternalTransferPayload,
  ): Promise<ProviderOperationExecution> {
    const bankCode = this.extractBankCode(payload.metadata, payload);
    if (!bankCode) {
      throw new BadRequestException(
        'Flutterwave bank code is required for NG external transfers.',
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
      String(data.status ?? '').toLowerCase() === 'successful' &&
      String(data.payment_type ?? '').toLowerCase() === 'bank_transfer'
    ) {
      const verified = await this.verifyTransaction(data);
      const verifiedData = verified?.data ?? verified ?? data;
      const txRef = String(verifiedData?.tx_ref ?? data?.tx_ref ?? '');
      const fundingTarget = await this.resolveFundingTarget(txRef);

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
                info: `Wallet funding via Flutterwave bank transfer`,
                description: `Flutterwave bank transfer funding (${txRef})`,
              },
            }
          : {
              fundingReference: txRef,
              fundingTargetResolved: false,
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

  private mapExistingRail(wallet: Wallet): ProviderWalletRail {
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
      providerMetadata: wallet.providerMetadata ?? null,
    };
  }

  private buildVirtualAccountPayload(user: User, txRef: string) {
    const identity = user.kyc?.identityData ?? {};
    const payload: Record<string, any> = {
      email: user.email,
      tx_ref: txRef,
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

  private extractBankCode(
    metadata: Record<string, any> | null | undefined,
    payload: ExternalTransferPayload,
  ): string | null {
    const bankCode =
      metadata?.bankCode ??
      metadata?.destinationBankCode ??
      payload.destinationRoutingNumber ??
      null;

    return bankCode ? String(bankCode) : null;
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
    const match = txRef.match(/^VIDAL_FLW_RAIL_([^_]+)_([^_]+)$/);
    const walletId = match?.[1] ?? null;
    const userId = match?.[2] ?? null;

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
