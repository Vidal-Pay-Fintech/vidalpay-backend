import { Injectable } from '@nestjs/common';
import { User } from 'src/database/entities/user.entity';

export type AccountJurisdiction = 'NG' | 'US' | 'UNKNOWN';

export type JurisdictionDecision = {
  jurisdiction: AccountJurisdiction;
  countryCode: string | null;
  country: string | null;
  residency: string | null;
  region: string | null;
  phoneCountry: AccountJurisdiction | null;
  source: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reviewRequired: boolean;
  reason: string | null;
};

const NIGERIA_VALUES = new Set(['NG', 'NGA', 'NIGERIA', '+234', '234']);
const UNITED_STATES_VALUES = new Set([
  'US',
  'USA',
  'UNITED STATES',
  'UNITED_STATES',
  'UNITED STATES OF AMERICA',
  '+1',
  '1',
]);

@Injectable()
export class JurisdictionService {
  /**
   * Deterministic precedence:
   * 1. Saved residency / country-of-residence fields.
   * 2. Saved profile country and countryCode fields.
   * 3. Saved account region.
   * 4. Phone country code is supporting evidence only.
   *
   * Phone, IP, device location, and wallet currency must not independently
   * establish or change the user's financial jurisdiction.
   */
  resolve(user: User): JurisdictionDecision {
    const region = this.clean(user.region);
    const countryCode = this.clean(user.countryCode);
    const residency = this.clean(user.residency);
    const country = this.clean(user.country);
    const phoneCountry = this.phoneCountry(user.phoneNumber);

    const authoritativeSignals = [
      { source: 'RESIDENCY', value: residency },
      { source: 'COUNTRY_CODE', value: countryCode },
      { source: 'COUNTRY', value: country },
      { source: 'REGION', value: region },
    ]
      .map((signal) => ({
        source: signal.source,
        jurisdiction: signal.value ? this.fromValue(signal.value) : null,
      }))
      .filter(
        (signal): signal is { source: string; jurisdiction: AccountJurisdiction } =>
          signal.jurisdiction !== null,
      );

    const uniqueAuthoritativeJurisdictions = [
      ...new Set(authoritativeSignals.map((signal) => signal.jurisdiction)),
    ];

    if (uniqueAuthoritativeJurisdictions.length > 1) {
      return {
        jurisdiction: 'UNKNOWN',
        countryCode,
        country,
        residency,
        region,
        phoneCountry,
        source: 'CONFLICTING_ACCOUNT_PROFILE',
        confidence: 'LOW',
        reviewRequired: true,
        reason:
          'Saved account jurisdiction signals conflict. Compliance review is required before foreign-only products can be evaluated.',
      };
    }

    const authoritativeJurisdiction = uniqueAuthoritativeJurisdictions[0];

    if (authoritativeJurisdiction === 'NG') {
      return {
        jurisdiction: 'NG',
        countryCode,
        country,
        residency,
        region,
        phoneCountry,
        source: authoritativeSignals.find(
          (signal) => signal.jurisdiction === 'NG',
        )?.source ?? 'USER_PROFILE',
        confidence: 'HIGH',
        reviewRequired: false,
        reason: null,
      };
    }

    if (authoritativeJurisdiction === 'US') {
      return {
        jurisdiction: 'US',
        countryCode,
        country,
        residency,
        region,
        phoneCountry,
        source: authoritativeSignals.find(
          (signal) => signal.jurisdiction === 'US',
        )?.source ?? 'USER_PROFILE',
        confidence: 'HIGH',
        reviewRequired: false,
        reason: null,
      };
    }

    return {
      jurisdiction: 'UNKNOWN',
      countryCode,
      country,
      residency,
      region,
      phoneCountry,
      source: 'UNAVAILABLE',
      confidence: 'LOW',
      reviewRequired: true,
      reason:
        phoneCountry
          ? 'Phone country code is only a supporting signal and cannot establish financial jurisdiction by itself.'
          : 'No supported account jurisdiction could be resolved from the saved account profile.',
    };
  }

  private clean(value?: string | null) {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim().toUpperCase()
      : null;
  }

  private fromValue(value: string): AccountJurisdiction | null {
    const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (NIGERIA_VALUES.has(normalized)) return 'NG';
    if (UNITED_STATES_VALUES.has(normalized)) return 'US';
    return null;
  }

  private phoneCountry(phoneNumber?: string | null): AccountJurisdiction | null {
    if (!phoneNumber) return null;
    const normalized = phoneNumber.replace(/[\s()-]/g, '');
    if (normalized.startsWith('+234')) return 'NG';
    if (normalized.startsWith('+1')) return 'US';
    return null;
  }
}
