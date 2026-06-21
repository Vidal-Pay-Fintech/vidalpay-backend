import { BadRequestException, Injectable } from '@nestjs/common';
import { SupportedRegion } from 'src/common/enum/supported-region.enum';
import { Currency } from 'src/utils/enums/wallet.enum';

export enum SignupRegionSource {
  DECLARED = 'DECLARED',
  PHONE_LOOKUP = 'PHONE_LOOKUP',
  IP_COUNTRY = 'IP_COUNTRY',
  PHONE_PREFIX = 'PHONE_PREFIX',
}

export type SignupRegionConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface SignupRegionInput {
  country?: string | null;
  countryCode?: string | null;
  residency?: string | null;
  phoneNumber: string;
  phoneCountryCode?: string | null;
  ipCountryCode?: string | null;
}

export interface SignupRegionDecision {
  region: SupportedRegion;
  defaultCurrency: Currency;
  source: SignupRegionSource;
  confidence: SignupRegionConfidence;
  hasConflict: boolean;
  evidence: {
    declaredRegion: SupportedRegion | null;
    phoneLookupRegion: SupportedRegion | null;
    phonePrefixRegion: SupportedRegion | null;
    ipRegion: SupportedRegion | null;
  };
}

@Injectable()
export class SignupRegionService {
  resolve(input: SignupRegionInput): SignupRegionDecision {
    const declaredRegion = this.resolveDeclaredRegion(input);
    const phoneLookupRegion = this.parseSupportedRegion(input.phoneCountryCode);
    const phonePrefixRegion = this.regionFromPhonePrefix(input.phoneNumber);
    const ipRegion = this.parseSupportedRegion(input.ipCountryCode);

    const region =
      declaredRegion ?? phoneLookupRegion ?? ipRegion ?? phonePrefixRegion;

    if (!region) {
      throw new BadRequestException(
        'Vidal Pay currently supports signup in Nigeria and the United States. Provide countryCode as NG or US.',
      );
    }

    const source = declaredRegion
      ? SignupRegionSource.DECLARED
      : phoneLookupRegion
        ? SignupRegionSource.PHONE_LOOKUP
        : ipRegion
          ? SignupRegionSource.IP_COUNTRY
          : SignupRegionSource.PHONE_PREFIX;
    const evidenceRegions = [
      declaredRegion,
      phoneLookupRegion,
      phonePrefixRegion,
      ipRegion,
    ].filter((value): value is SupportedRegion => Boolean(value));
    const hasConflict = new Set(evidenceRegions).size > 1;
    const confirmingSignals = evidenceRegions.filter(
      (candidate) => candidate === region,
    ).length;

    return {
      region,
      defaultCurrency:
        region === SupportedRegion.NG ? Currency.NGN : Currency.USD,
      source,
      confidence: this.resolveConfidence(
        source,
        confirmingSignals,
        hasConflict,
      ),
      hasConflict,
      evidence: {
        declaredRegion,
        phoneLookupRegion,
        phonePrefixRegion,
        ipRegion,
      },
    };
  }

  private resolveDeclaredRegion(
    input: SignupRegionInput,
  ): SupportedRegion | null {
    const rawValues = [
      input.countryCode,
      input.country,
      input.residency,
    ].filter((value): value is string => Boolean(value?.trim()));
    if (!rawValues.length) {
      return null;
    }

    const regions = rawValues.map((value) => {
      const region = this.parseSupportedRegion(value);
      if (!region) {
        throw new BadRequestException(
          'Vidal Pay currently supports signup in Nigeria and the United States.',
        );
      }
      return region;
    });

    if (new Set(regions).size > 1) {
      throw new BadRequestException(
        'The supplied country and residency information conflict.',
      );
    }

    return regions[0];
  }

  private parseSupportedRegion(value?: string | null): SupportedRegion | null {
    if (!value?.trim()) {
      return null;
    }

    const normalized = value.trim().toUpperCase();
    if (
      ['NG', 'NGA', 'NIGERIA', 'FEDERAL REPUBLIC OF NIGERIA'].includes(
        normalized,
      )
    ) {
      return SupportedRegion.NG;
    }
    if (
      [
        'US',
        'USA',
        'UNITED STATES',
        'UNITED STATES OF AMERICA',
        'AMERICA',
      ].includes(normalized)
    ) {
      return SupportedRegion.US;
    }
    return null;
  }

  private regionFromPhonePrefix(phoneNumber: string): SupportedRegion | null {
    const normalized = phoneNumber.replace(/[\s()-]/g, '');
    if (normalized.startsWith('+234')) {
      return SupportedRegion.NG;
    }
    if (normalized.startsWith('+1')) {
      return SupportedRegion.US;
    }
    return null;
  }

  private resolveConfidence(
    source: SignupRegionSource,
    confirmingSignals: number,
    hasConflict: boolean,
  ): SignupRegionConfidence {
    if (hasConflict) {
      return 'LOW';
    }
    if (source === SignupRegionSource.PHONE_LOOKUP || confirmingSignals >= 2) {
      return 'HIGH';
    }
    if (
      source === SignupRegionSource.DECLARED ||
      source === SignupRegionSource.IP_COUNTRY
    ) {
      return 'MEDIUM';
    }
    return 'LOW';
  }
}
