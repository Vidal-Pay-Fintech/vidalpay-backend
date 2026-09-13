import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class ProviderHttpService {
  constructor(private readonly configService: ConfigService) {}

  unitClient(): AxiosInstance {
    return axios.create({
      baseURL:
        this.configService.get<string>('UNIT_BASE_URL') ??
        'https://api.s.unit.sh',
      headers: {
        Authorization: `Bearer ${this.configService.get<string>('UNIT_API_TOKEN')}`,
        'Content-Type': 'application/vnd.api+json',
      },
      timeout: Number(this.configService.get<string>('PROVIDER_TIMEOUT_MS') ?? 15000),
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
      timeout: Number(this.configService.get<string>('PROVIDER_TIMEOUT_MS') ?? 15000),
    });
  }
}
