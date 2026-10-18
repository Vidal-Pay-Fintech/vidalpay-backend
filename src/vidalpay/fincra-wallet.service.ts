import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AxiosError } from 'axios';
import { ProviderHttpService } from './provider-http.service';

export type FincraVirtualAccountRequestPayload = {
  currency: string;
  accountType: 'individual' | 'corporate';
  KYCInformation?: Record<string, unknown>;
  utilityBill?: string | string[];
  bankStatement?: string | string[];
  meansOfId?: string | string[];
  accountAgreement?: string | string[];
  regulatoryEvidence?: string | string[];
  requestedCurrencies?: string[];
  merchantReference?: string;
  phoneNumber?: string;
  monthlyTransactionCount?: string;
  monthlyTransactionVolume?: string;
  metadata?: Record<string, unknown>;
  accountOpeningDate?: string;
  isTermsAccepted?: boolean;
  termsAndConditionAcceptance?: Record<string, unknown>;
};

export type FincraVirtualAccountRequestResult = {
  status: number;
  data: unknown;
  providerReference: string | null;
  requestStatus: string;
};

@Injectable()
export class FincraWalletService {
  constructor(private readonly providerHttpService: ProviderHttpService) {}

  async listBanks(country = 'NG', currency = 'NGN') {
    try {
      const response = await this.providerHttpService.fincraClient().get(
        '/core/banks',
        { params: { country, currency, paymentDestination: 'bank_account' } },
      );
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      throw new ServiceUnavailableException({
        code: 'FINCRA_BANK_CATALOG_UNAVAILABLE',
        provider: 'FINCRA',
        status: axiosError.response?.status ?? null,
        message:
          axiosError.response?.status === 401
            ? 'Fincra bank catalog authentication failed.'
            : axiosError.response?.status === 403
              ? 'Fincra bank payout catalog is not enabled for this merchant.'
              : 'Fincra bank catalog could not be reached.',
        retryable: !axiosError.response || (axiosError.response.status ?? 0) >= 500,
      });
    }
  }

  async requestPermanentVirtualAccount(
    payload: FincraVirtualAccountRequestPayload,
  ): Promise<FincraVirtualAccountRequestResult> {
    try {
      const response = await this.providerHttpService.fincraClient().post(
        '/profile/virtual-accounts/requests',
        payload,
      );
      return {
        status: response.status,
        data: response.data,
        providerReference: this.extractProviderReference(response.data),
        requestStatus: this.extractRequestStatus(response.data),
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      throw new ServiceUnavailableException({
        code: 'FINCRA_VIRTUAL_ACCOUNT_REQUEST_FAILED',
        provider: 'FINCRA',
        status: axiosError.response?.status ?? null,
        message: this.safeErrorMessage(axiosError),
        retryable: this.isRetryable(axiosError),
      });
    }
  }

  async generateConversionQuote(payload: Record<string, unknown>) {
    try {
      const { data } = await this.providerHttpService
        .fincraClient()
        .post('/quotes/generate', payload);
      return data as Record<string, unknown>;
    } catch (error) {
      const axiosError = error as AxiosError;
      throw new ServiceUnavailableException({
        code: 'FX_QUOTE_FAILED',
        status: axiosError.response?.status ?? null,
        message: 'A conversion quote could not be obtained.',
        retryable: !axiosError.response || (axiosError.response.status ?? 0) >= 500,
      });
    }
  }

  async initiateConversion(payload: Record<string, unknown>) {
    try {
      const { data } = await this.providerHttpService
        .fincraClient()
        .post('/conversions/initiate', payload);
      return data as Record<string, unknown>;
    } catch (error) {
      const axiosError = error as AxiosError;
      throw new ServiceUnavailableException({
        code: 'FX_CONVERSION_REQUEST_FAILED',
        status: axiosError.response?.status ?? null,
        message: 'The conversion request could not be confirmed.',
        retryable: !axiosError.response || (axiosError.response.status ?? 0) >= 500,
      });
    }
  }

  async verifyConversionStatus(reference: string) {
    try {
      const { data } = await this.providerHttpService
        .fincraClient()
        .get(`/conversions/reference/${encodeURIComponent(reference)}`);
      return data as Record<string, unknown>;
    } catch (error) {
      const axiosError = error as AxiosError;
      throw new ServiceUnavailableException({
        code: 'FX_CONVERSION_STATUS_UNAVAILABLE',
        status: axiosError.response?.status ?? null,
        message: 'Conversion settlement could not be verified.',
        retryable: true,
      });
    }
  }

  private extractProviderReference(value: unknown): string | null {
    const found = this.findFirstString(value, [
      'id',
      '_id',
      'reference',
      'requestId',
      'requestID',
      'virtualAccountRequestId',
      'virtualAccountId',
    ]);
    return found && found.length > 0 ? found : null;
  }

  private extractRequestStatus(value: unknown): string {
    const found = this.findFirstString(value, ['status', 'state']);
    return found?.toUpperCase() ?? 'SUBMITTED';
  }

  private findFirstString(value: unknown, keys: string[]): string | null {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findFirstString(item, keys);
        if (found) return found;
      }
      return null;
    }
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      const direct = record[key];
      if (typeof direct === 'string' && direct.trim().length > 0) {
        return direct.trim();
      }
    }
    for (const item of Object.values(record)) {
      const found = this.findFirstString(item, keys);
      if (found) return found;
    }
    return null;
  }

  private safeErrorMessage(error: AxiosError) {
    const status = error.response?.status;
    if (status === 400) return 'Fincra rejected the virtual account request.';
    if (status === 401) return 'Fincra authentication failed.';
    if (status === 403) {
      return 'Fincra virtual account product is not enabled for this merchant.';
    }
    if (status === 422) {
      return 'Fincra requires additional or different virtual account request fields.';
    }
    if (status && status >= 500) return 'Fincra returned a server error.';
    if (error.code === 'ECONNABORTED') return 'Fincra request timed out.';
    return 'Fincra virtual account request failed.';
  }

  private isRetryable(error: AxiosError) {
    const status = error.response?.status;
    return error.code === 'ECONNABORTED' || Boolean(status && status >= 500);
  }
}
