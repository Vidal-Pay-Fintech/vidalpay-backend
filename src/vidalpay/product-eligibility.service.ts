import { Injectable } from '@nestjs/common';
import { User } from 'src/database/entities/user.entity';
import { createBlockedResponse } from './contracts';
import {
  AccountJurisdiction,
  JurisdictionDecision,
  JurisdictionService,
} from './jurisdiction.service';

export type ProductCode =
  | 'wallets'
  | 'transfers'
  | 'receive'
  | 'fx'
  | 'utilities'
  | 'cards'
  | 'crypto'
  | 'investments'
  | 'lending'
  | 'foreign_tax';

export type ProductEligibility = {
  product: ProductCode;
  enabled: boolean;
  status: 'AVAILABLE' | 'BLOCKED' | 'PROVIDER_NOT_CONFIGURED' | 'REVIEW_REQUIRED';
  jurisdiction: AccountJurisdiction;
  reason: string | null;
  blockedResponse: ReturnType<typeof createBlockedResponse> | null;
};

const PRODUCT_LABELS: Record<ProductCode, string> = {
  wallets: 'Wallets',
  transfers: 'Transfers',
  receive: 'Receive money',
  fx: 'Currency conversion',
  utilities: 'Bills and utilities',
  cards: 'Cards',
  crypto: 'Crypto',
  investments: 'Investments',
  lending: 'Loans',
  foreign_tax: 'Foreign tax filing',
};

@Injectable()
export class ProductEligibilityService {
  constructor(private readonly jurisdictionService: JurisdictionService) {}

  capabilities(user: User) {
    const jurisdiction = this.jurisdictionService.resolve(user);
    const products: Record<ProductCode, ProductEligibility> = {
      wallets: this.evaluate(user, 'wallets', jurisdiction),
      transfers: this.evaluate(user, 'transfers', jurisdiction),
      receive: this.evaluate(user, 'receive', jurisdiction),
      fx: this.evaluate(user, 'fx', jurisdiction),
      utilities: this.evaluate(user, 'utilities', jurisdiction),
      cards: this.evaluate(user, 'cards', jurisdiction),
      crypto: this.evaluate(user, 'crypto', jurisdiction),
      investments: this.evaluate(user, 'investments', jurisdiction),
      lending: this.evaluate(user, 'lending', jurisdiction),
      foreign_tax: this.evaluate(user, 'foreign_tax', jurisdiction),
    };

    return {
      jurisdiction,
      products,
      generatedAt: new Date().toISOString(),
    };
  }

  evaluate(
    _user: User,
    product: ProductCode,
    jurisdiction = this.jurisdictionService.resolve(_user),
  ): ProductEligibility {
    if (jurisdiction.reviewRequired && jurisdiction.jurisdiction === 'UNKNOWN') {
      return this.blocked(product, jurisdiction, {
        code: 'JURISDICTION_REVIEW_REQUIRED',
        status: 'REVIEW_REQUIRED',
        reason:
          jurisdiction.reason ??
          'VidalPay needs a supported account jurisdiction before this product can be evaluated.',
        missingRequirements: ['SUPPORTED_ACCOUNT_JURISDICTION'],
      });
    }

    if (jurisdiction.jurisdiction === 'NG') {
      if (['crypto', 'investments', 'lending', 'foreign_tax'].includes(product)) {
        return this.blocked(product, jurisdiction, {
          code: 'PRODUCT_NOT_AVAILABLE_IN_JURISDICTION',
          reason: `${PRODUCT_LABELS[product]} is not available for Nigeria-based accounts in the current VidalPay compliance policy.`,
          missingRequirements: ['COMPLIANCE_APPROVAL', 'SUPPORTED_PROVIDER_PRODUCT'],
        });
      }

      return {
        product,
        enabled: true,
        status: 'AVAILABLE',
        jurisdiction: jurisdiction.jurisdiction,
        reason: jurisdiction.reason,
        blockedResponse: null,
      };
    }

    if (jurisdiction.jurisdiction === 'US') {
      if (['wallets', 'transfers', 'receive', 'fx', 'cards'].includes(product)) {
        return {
          product,
          enabled: true,
          status: 'AVAILABLE',
          jurisdiction: jurisdiction.jurisdiction,
          reason: null,
          blockedResponse: null,
        };
      }

      return this.blocked(product, jurisdiction, {
        code: 'PROVIDER_NOT_CONFIGURED_FOR_PRODUCT',
        status: 'PROVIDER_NOT_CONFIGURED',
        reason: `${PRODUCT_LABELS[product]} requires a backend provider and product approval before it can be enabled for United States accounts.`,
        missingRequirements: ['SUPPORTED_PROVIDER_PRODUCT'],
      });
    }

    return this.blocked(product, jurisdiction, {
      code: 'JURISDICTION_NOT_SUPPORTED',
      reason: 'This account jurisdiction is not supported for the requested VidalPay product.',
      missingRequirements: ['SUPPORTED_ACCOUNT_JURISDICTION'],
    });
  }

  private blocked(
    product: ProductCode,
    jurisdiction: JurisdictionDecision,
    options: {
      code: string;
      status?: ProductEligibility['status'];
      reason: string;
      missingRequirements: string[];
    },
  ): ProductEligibility {
    return {
      product,
      enabled: false,
      status: options.status ?? 'BLOCKED',
      jurisdiction: jurisdiction.jurisdiction,
      reason: options.reason,
      blockedResponse: createBlockedResponse({
        code: options.code,
        message: `${PRODUCT_LABELS[product]} is not available for this account.`,
        feature: PRODUCT_LABELS[product],
        capability: product,
        provider: 'VidalPay Compliance',
        reason: options.reason,
        missingRequirements: options.missingRequirements,
        retryable: false,
      }),
    };
  }
}
