import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { createHmac } from 'crypto';
import { FincraConfigurationError, resolveFincraConfiguration } from './fincra-configuration';

@Injectable()
export class ProviderHttpService implements OnModuleInit {
  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    // Catch a mistyped environment before serving financial requests.
    this.fincraConfiguration();
  }

  private fincraConfiguration() {
    return resolveFincraConfiguration((key) => this.configService.get<string>(key));
  }

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

  fincraClient(): AxiosInstance {
    const { baseUrl } = this.fincraConfiguration();
    const apiKey = this.configService.get<string>('FINCRA_API_KEY')?.trim();
    if (!apiKey) {
      throw new FincraConfigurationError('FINCRA_API_KEY is required for Fincra requests.');
    }
    const client = axios.create({
      baseURL: baseUrl,
      headers: {
        'api-key': apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: this.timeout(),
      maxRedirects: 0,
    });
    client.interceptors.request.use((config) => {
      const target = new URL(config.url ?? '/', `${config.baseURL ?? baseUrl}/`);
      if (target.origin !== baseUrl || target.username || target.password || target.hash) {
        throw new FincraConfigurationError('Fincra requests must use the configured official origin.');
      }
      // Do not forward provider credentials to a redirect or per-request proxy.
      config.baseURL = baseUrl;
      config.url = `${target.pathname}${target.search}`;
      config.maxRedirects = 0;
      config.proxy = false;
      return config;
    });
    return client;
  }

  fincraSandboxClient(): AxiosInstance {
    if (this.fincraConfiguration().environment !== 'sandbox') {
      throw new FincraConfigurationError('Sandbox probes are disabled when FINCRA_ENV=live.');
    }
    return this.fincraClient();
  }

  vtuNgClient(accessToken?: string): AxiosInstance {
    return axios.create({
      baseURL: this.baseUrl('VTU_BASE_URL', 'https://vtu.ng/wp-json'),
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: this.timeout(),
    });
  }

  yellowCardClient(): AxiosInstance {
    const baseURL = this.baseUrl(
      'YELLOWCARD_BASE_URL',
      'https://sandbox.api.yellowcard.io',
    );
    const apiKey = this.configService.get<string>('YELLOWCARD_API_KEY') ?? '';
    const secret =
      this.configService.get<string>('YELLOWCARD_SECRET_KEY') ??
      this.configService.get<string>('YELLOWCARD_API_SECRET') ??
      '';
    const client = axios.create({
      baseURL,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(apiKey ? { 'X-YC-API-Key': apiKey } : {}),
      },
      timeout: this.timeout(),
    });

    client.interceptors.request.use((config) => {
      if (!secret) return config;
      const timestamp = `${Date.now()}`;
      const method = (config.method ?? 'get').toUpperCase();
      const path = this.requestPath(baseURL, config.url);
      const body =
        config.data && typeof config.data !== 'string'
          ? JSON.stringify(config.data)
          : (config.data ?? '');
      const signature = createHmac('sha256', secret)
        .update(`${timestamp}${method}${path}${body}`)
        .digest('hex');
      config.headers.set('X-YC-Timestamp', timestamp);
      config.headers.set('X-YC-Signature', signature);
      return config;
    });

    return client;
  }

  private requestPath(baseURL: string, requestUrl?: string) {
    try {
      return new URL(requestUrl ?? '/', `${baseURL}/`).pathname;
    } catch {
      return requestUrl ?? '/';
    }
  }

}
