import { BadRequestException, Injectable } from '@nestjs/common';
import { KycProvider } from 'src/common/enum/kyc-provider.enum';
import { KycStatus } from 'src/common/enum/kyc-status.enum';
import {
  SUPPORTED_REGION_LABELS,
  SupportedRegion,
} from 'src/common/enum/supported-region.enum';
import { KycDocument } from 'src/database/entities/kyc-document.entity';
import {
  KycAddressSnapshot,
  KycIdentitySnapshot,
  UserKyc,
} from 'src/database/entities/user-kyc.entity';
import { User } from 'src/database/entities/user.entity';
import { KycProviderRouterService } from 'src/integrations/kyc/kyc-provider-router.service';
import { API_MESSAGES } from 'src/utils/apiMessages';
import { UpsertKycIdentityDto } from './dto/upsert-kyc-identity.dto';
import { UserCapabilities } from './interfaces/user-capability.interface';

export type RegionResolutionState =
  | 'RESOLVED'
  | 'UNRESOLVED'
  | 'UNSUPPORTED'
  | 'CONFLICT';

export interface RegionResolution {
  region: SupportedRegion | null;
  state: RegionResolutionState;
  blockedReason: string | null;
}

@Injectable()
export class UserPolicyService {
  constructor(private readonly kycProviderRouter: KycProviderRouterService) {}

  resolveRegionForUser(
    user: Partial<User>,
    kyc?: Partial<UserKyc> | null,
  ): RegionResolution {
    return this.resolveRegion({
      country: this.normalizeOptionalString(user.country) ?? kyc?.country ?? null,
      countryCode:
        this.normalizeOptionalString(user.countryCode) ??
        kyc?.countryCode ??
        null,
      residency: this.normalizeOptionalString(user.residency) ?? null,
    });
  }

  resolveRegion(input: {
    country?: string | null;
    countryCode?: string | null;
    residency?: string | null;
  }): RegionResolution {
    const evidence = [
      this.normalizeOptionalString(input.countryCode),
      this.normalizeOptionalString(input.country),
      this.normalizeOptionalString(input.residency),
    ].filter((value): value is string => Boolean(value));

    if (!evidence.length) {
      return {
        region: null,
        state: 'UNRESOLVED',
        blockedReason: API_MESSAGES.KYC_REGION_REQUIRED,
      };
    }

    const normalizedRegions = new Set<SupportedRegion>();
    for (const value of evidence) {
      const normalized = this.parseSupportedRegion(value);
      if (!normalized) {
        return {
          region: null,
          state: 'UNSUPPORTED',
          blockedReason: API_MESSAGES.KYC_UNSUPPORTED_REGION,
        };
      }
      normalizedRegions.add(normalized);
    }

    if (normalizedRegions.size > 1) {
      return {
        region: null,
        state: 'CONFLICT',
        blockedReason: API_MESSAGES.KYC_REGION_CONFLICT,
      };
    }

    return {
      region: Array.from(normalizedRegions)[0] ?? null,
      state: 'RESOLVED',
      blockedReason: null,
    };
  }

  parseSupportedRegion(value: string): SupportedRegion | null {
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

  computeCapabilities(user: User): UserCapabilities {
    const kyc = user.kyc;
    const kycStatus = kyc?.status ?? user.kycStatus ?? KycStatus.NOT_STARTED;
    const resolution = this.resolveRegionForUser(user, kyc);
    const provider = resolution.region
      ? this.kycProviderRouter.mapRegionToProvider(resolution.region)
      : null;

    const canReceive = true;
    const canTransfer =
      resolution.state === 'RESOLVED' && kycStatus === KycStatus.VERIFIED;

    let blockedReason: string | null = null;
    if (!canTransfer) {
      if (resolution.state === 'UNSUPPORTED') {
        blockedReason =
          resolution.blockedReason ?? API_MESSAGES.KYC_UNSUPPORTED_REGION;
      } else if (resolution.state === 'CONFLICT') {
        blockedReason =
          resolution.blockedReason ?? API_MESSAGES.KYC_REGION_CONFLICT;
      } else if (resolution.state === 'UNRESOLVED') {
        blockedReason =
          resolution.blockedReason ?? API_MESSAGES.KYC_REGION_REQUIRED;
      } else {
        blockedReason =
          kyc?.blockedReason ?? this.mapKycStatusToBlockedReason(kycStatus);
      }
    }

    return {
      region: resolution.region,
      provider,
      canReceive,
      canTransfer,
      blockedReason,
      limits: {
        policyVersion: 'staging-profile-kyc-v1',
        tier:
          resolution.state === 'UNSUPPORTED'
            ? 'UNSUPPORTED'
            : canTransfer
              ? 'VERIFIED'
              : 'PENDING_KYC',
        receive: {
          dailyAmount: null,
          monthlyAmount: null,
          managedBy: 'RECEIVE_ENABLED_BY_DEFAULT',
        },
        transfer: {
          dailyAmount: canTransfer ? null : 0,
          monthlyAmount: canTransfer ? null : 0,
          managedBy: canTransfer ? 'FUTURE_PROGRESSIVE_POLICY' : 'KYC_GATE',
        },
        progressiveIncreases: {
          enabled: canTransfer,
          basis: 'ACCOUNT_ACTIVITY',
          reviewRequired: true,
        },
        futureProducts: {
          loanEligible: false,
          taxFilingEligible: false,
        },
      },
    };
  }

  validateIdentityPayloadForRegion(
    region: SupportedRegion,
    dto: UpsertKycIdentityDto,
  ) {
    if (
      region === SupportedRegion.NG &&
      (!this.normalizeOptionalString(dto.nin) ||
        !this.normalizeOptionalString(dto.bvn))
    ) {
      throw new BadRequestException(API_MESSAGES.KYC_IDENTITY_INCOMPLETE_NG);
    }

    if (region === SupportedRegion.US) {
      const hasSsn = Boolean(this.normalizeOptionalString(dto.ssn));
      const hasApprovedIdentity = Boolean(
        this.normalizeOptionalString(dto.approvedIdentityType) &&
          this.normalizeOptionalString(dto.approvedIdentityValue),
      );

      if (!hasSsn && !hasApprovedIdentity) {
        throw new BadRequestException(API_MESSAGES.KYC_IDENTITY_INCOMPLETE_US);
      }
    }
  }

  validateStoredKycForSubmission(region: SupportedRegion, kyc: UserKyc) {
    const identity = kyc.identityData;
    if (!identity) {
      throw new BadRequestException(API_MESSAGES.KYC_IDENTITY_INCOMPLETE);
    }

    this.validateIdentityPayloadForRegion(region, {
      nin: identity.nin ?? undefined,
      bvn: identity.bvn ?? undefined,
      ssn: identity.ssn ?? undefined,
      approvedIdentityType: identity.approvedIdentityType ?? undefined,
      approvedIdentityValue: identity.approvedIdentityValue ?? undefined,
      metadata: identity.metadata ?? undefined,
    });

    const address = kyc.addressData;
    if (
      !address?.addressLine1 ||
      !address.city ||
      !address.stateOrRegion ||
      !address.country ||
      !address.countryCode
    ) {
      throw new BadRequestException(API_MESSAGES.KYC_ADDRESS_INCOMPLETE);
    }

    if (!kyc.livenessData) {
      throw new BadRequestException(API_MESSAGES.KYC_LIVENESS_INCOMPLETE);
    }
  }

  buildKycRequirements(region: SupportedRegion | null) {
    if (region === SupportedRegion.NG) {
      return {
        supportedRegions: [SupportedRegion.NG, SupportedRegion.US],
        provider: KycProvider.FLUTTERWAVE,
        identity: {
          allOf: ['nin', 'bvn'],
          oneOf: [],
        },
        address: {
          allOf: ['addressLine1', 'city', 'stateOrRegion', 'country', 'countryCode'],
        },
        liveness: {
          required: true,
        },
        documents: {
          optional: true,
        },
      };
    }

    if (region === SupportedRegion.US) {
      return {
        supportedRegions: [SupportedRegion.NG, SupportedRegion.US],
        provider: KycProvider.LEAD_BANK,
        identity: {
          allOf: [],
          oneOf: [['ssn'], ['approvedIdentityType', 'approvedIdentityValue']],
        },
        address: {
          allOf: ['addressLine1', 'city', 'stateOrRegion', 'country', 'countryCode'],
        },
        liveness: {
          required: true,
        },
        documents: {
          optional: true,
        },
      };
    }

    return {
      supportedRegions: [SupportedRegion.NG, SupportedRegion.US],
      provider: null,
      identity: null,
      address: {
        allOf: ['addressLine1', 'city', 'stateOrRegion', 'country', 'countryCode'],
      },
      liveness: {
        required: true,
      },
      documents: {
        optional: true,
      },
    };
  }

  buildAddressSnapshotFromSources(
    base?: Partial<KycAddressSnapshot>,
    fallback?: Partial<KycAddressSnapshot>,
  ): KycAddressSnapshot {
    return {
      addressLine1:
        this.normalizeOptionalString(base?.addressLine1) ??
        this.normalizeOptionalString(fallback?.addressLine1) ??
        null,
      addressLine2:
        this.normalizeOptionalString(base?.addressLine2) ??
        this.normalizeOptionalString(fallback?.addressLine2) ??
        null,
      city:
        this.normalizeOptionalString(base?.city) ??
        this.normalizeOptionalString(fallback?.city) ??
        null,
      stateOrRegion:
        this.normalizeOptionalString(base?.stateOrRegion) ??
        this.normalizeOptionalString(fallback?.stateOrRegion) ??
        null,
      postalCode:
        this.normalizeOptionalString(base?.postalCode) ??
        this.normalizeOptionalString(fallback?.postalCode) ??
        null,
      country:
        this.normalizeOptionalString(base?.country) ??
        this.normalizeOptionalString(fallback?.country) ??
        null,
      countryCode:
        this.normalizeOptionalString(base?.countryCode) ??
        this.normalizeOptionalString(fallback?.countryCode) ??
        null,
      metadata: base?.metadata ?? null,
    };
  }

  maskIdentityData(identityData: KycIdentitySnapshot | null) {
    if (!identityData) {
      return null;
    }

    return {
      ...identityData,
      nin: this.maskValue(identityData.nin),
      bvn: this.maskValue(identityData.bvn),
      ssn: this.maskValue(identityData.ssn),
      approvedIdentityValue: this.maskValue(identityData.approvedIdentityValue),
    };
  }

  serializeDocuments(documents: KycDocument[]) {
    return documents.map((document) => ({
      id: document.id,
      stage: document.stage,
      documentType: document.documentType,
      originalFileName: document.originalFileName,
      storedFileName: document.storedFileName,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      storage: document.storage,
      fileUrl: document.fileUrl,
      uploadedViaBackend: document.uploadedViaBackend,
      metadata: document.metadata,
      createdAt: document.createdAt,
    }));
  }

  maskValue(value?: string | null, visibleTail = 4) {
    const normalized = this.normalizeOptionalString(value);
    if (!normalized) {
      return null;
    }

    if (normalized.length <= visibleTail) {
      return '*'.repeat(normalized.length);
    }

    const maskedLength = normalized.length - visibleTail;
    return `${'*'.repeat(maskedLength)}${normalized.slice(-visibleTail)}`;
  }

  normalizeOptionalString(value?: string | null) {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  hasAnyValue(values: Array<unknown>) {
    return values.some((value) => {
      if (typeof value === 'string') {
        return value.trim().length > 0;
      }

      return value !== null && value !== undefined;
    });
  }

  nextDraftStatus(currentStatus: KycStatus) {
    if (currentStatus === KycStatus.VERIFIED) {
      return KycStatus.REQUIRES_ACTION;
    }

    return KycStatus.DRAFT;
  }

  mapKycStatusToBlockedReason(status: KycStatus) {
    switch (status) {
      case KycStatus.NOT_STARTED:
      case KycStatus.DRAFT:
        return API_MESSAGES.TRANSFER_BLOCKED_PENDING_KYC;
      case KycStatus.PENDING_REVIEW:
        return API_MESSAGES.KYC_PENDING_REVIEW;
      case KycStatus.REQUIRES_ACTION:
        return API_MESSAGES.KYC_REQUIRES_ACTION;
      case KycStatus.REJECTED:
        return API_MESSAGES.KYC_REJECTED;
      case KycStatus.UNSUPPORTED:
        return API_MESSAGES.KYC_UNSUPPORTED_REGION;
      default:
        return API_MESSAGES.TRANSFER_BLOCKED_PENDING_KYC;
    }
  }

  getSupportedRegionLabel(region: SupportedRegion) {
    return SUPPORTED_REGION_LABELS[region];
  }
}
