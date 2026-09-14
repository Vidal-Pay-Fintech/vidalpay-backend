import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class ProviderHttpService {
  constructor(private readonly configService: ConfigService) {}

  private timeout(): number {
    return Number(
      this.configService.get<string>('PROVIDER_TIMEOUT_MS') ?? 15000,
    );
  }

  private baseUrl(envVar: string, fallback: string): string {
    const configured = this.configService.get<string>(envVar)?.trim();
    if (!configured) return fallback;
    try {
      const url = new URL(configured);
      if (url.protocol !== 'https:') throw new Error('HTTPS is required');
      return url.toString().replace(/\/$/, '');
    } catch {
      return fallback;
    }
  }

  unitClient(): AxiosInstance {
    return axios.create({
      baseURL:
        this.configService.get<string>('UNIT_BASE_URL') ??
        'https://api.s.unit.sh',
      headers: {
        Authorization: `Bearer ${this.configService.get<string>('UNIT_API_TOKEN')}`,
        'Content-Type': 'application/vnd.api+json',
      },
      timeout: this.timeout(),
    });
  }

  payVesselClient(): AxiosInstance {
    const apiSecret =
      this.configService.get<string>('PAYVESSEL_API_SECRET') ??
      this.configService.get<string>('PAYVESSEL_SECRET_KEY') ??
      '';
    return axios.create({
      baseURL:
        this.configService.get<string>('PAYVESSEL_BASE_URL') ??
        'https://sandbox.payvessel.com',
      headers: {
        'api-key': this.configService.get<string>('PAYVESSEL_API_KEY') ?? '',
        'api-secret': apiSecret,
        'Content-Type': 'application/json',
      },
      timeout: this.timeout(),
    });
  }

  sudoClient(): AxiosInstance {
    return axios.create({
      baseURL: this.baseUrl('SUDO_BASE_URL', 'https://api.sandbox.sudo.africa'),
      auth: {
        username: this.configService.get<string>('SUDO_API_KEY') ?? '',
        password: '',
      },
      headers: { 'Content-Type': 'application/json' },
      timeout: this.timeout(),
    });
  }

  reloadlyAirtimeClient(accessToken: string): AxiosInstance {
    return axios.create({
      baseURL: this.baseUrl(
        'RELOADLY_AIRTIME_BASE_URL',
        'https://topups-sandbox.reloadly.com',
      ),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/com.reloadly.topups-v1+json',
        'Content-Type': 'application/json',
      },
      timeout: this.timeout(),
    });
  }

  reloadlyUtilitiesClient(accessToken: string): AxiosInstance {
    return axios.create({
      baseURL: this.baseUrl(
        'RELOADLY_UTILITIES_BASE_URL',
        'https://utilities-sandbox.reloadly.com',
      ),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/com.reloadly.utilities-v1+json',
        'Content-Type': 'application/json',
      },
      timeout: this.timeout(),
    });
  }

  reloadlyAuthClient(): AxiosInstance {
    return axios.create({
      baseURL: this.baseUrl('RELOADLY_AUTH_URL', 'https://auth.reloadly.com'),
      headers: { 'Content-Type': 'application/json' },
      timeout: this.timeout(),
    });
  }
}
