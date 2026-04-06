import { BadRequestException, Injectable } from '@nestjs/common';
import { ClientKycStatus } from 'src/common/enum/client-kyc-status.enum';
import { KycProvider } from 'src/common/enum/kyc-provider.enum';
import { KycStatus } from 'src/common/enum/kyc-status.enum';
import { KycSectionCode } from 'src/common/enum/kyc-section.enum';
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
import {
  DynamicLimitProfile,
  KycSectionProgress,
  ProductAvailability,
} from './interfaces/user-account.interface';
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
    const hasTransactionPin = Boolean(this.normalizeOptionalString(user.pin));
    const isKycVerified = kycStatus === KycStatus.VERIFIED;

    const canReceive = true;
    const canTransfer =
      resolution.state === 'RESOLVED' && isKycVerified && hasTransactionPin;

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
      } else if (!isKycVerified) {
        blockedReason =
          kyc?.blockedReason ?? this.mapKycStatusToBlockedReason(kycStatus);
      } else {
        blockedReason = API_MESSAGES.TRANSFER_PIN_REQUIRED;
      }
    }

    const productAvailability = this.buildProductAvailability(
      resolution,
      canTransfer,
    );

    return {
      region: resolution.region,
      provider,
      hasTransactionPin,
      canReceive,
      canTransfer,
      blockedReason,
      limits: this.buildDynamicLimits(
        resolution,
        isKycVerified,
        hasTransactionPin,
        canTransfer,
        productAvailability,
      ),
      productAvailability,
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

  mapKycStatusToClientStatus(input: {
    status: KycStatus;
    regionState: RegionResolutionState;
    governmentIdComplete: boolean;
    addressComplete: boolean;
    livenessComplete: boolean;
  }): ClientKycStatus {
    const {
      status,
      regionState,
      governmentIdComplete,
      addressComplete,
      livenessComplete,
    } = input;

    if (status === KycStatus.VERIFIED) {
      return ClientKycStatus.VERIFIED;
    }

    if (status === KycStatus.REJECTED) {
      return ClientKycStatus.REJECTED;
    }

    if (status === KycStatus.PENDING_REVIEW) {
      return ClientKycStatus.UNDER_REVIEW;
    }

    if (regionState !== 'RESOLVED' || status === KycStatus.UNSUPPORTED) {
      return ClientKycStatus.NOT_STARTED;
    }

    if (governmentIdComplete && addressComplete && livenessComplete) {
      return ClientKycStatus.SUBMITTED;
    }

    if (
      status === KycStatus.DRAFT ||
      status === KycStatus.REQUIRES_ACTION ||
      governmentIdComplete ||
      addressComplete ||
      livenessComplete
    ) {
      return ClientKycStatus.IN_PROGRESS;
    }

    return ClientKycStatus.NOT_STARTED;
  }

  buildKycSectionProgress(input: {
    region: SupportedRegion | null;
    globalStatus: ClientKycStatus;
    rejectionReason: string | null;
    governmentIdComplete: boolean;
    addressComplete: boolean;
    livenessComplete: boolean;
  }): KycSectionProgress[] {
    const governmentIdDescription =
      input.region === SupportedRegion.NG
        ? 'Provide your NIN and BVN, then upload your government ID.'
        : input.region === SupportedRegion.US
          ? 'Provide your SSN or approved identity number and upload your government ID.'
          : 'Resolve your supported region before KYC can continue.';

    return [
      this.createSectionProgress(
        KycSectionCode.GOVERNMENT_ID,
        'Government ID',
        governmentIdDescription,
        input.globalStatus,
        input.governmentIdComplete,
        input.rejectionReason,
      ),
      this.createSectionProgress(
        KycSectionCode.ADDRESS,
        'Address',
        'Provide your address details and proof of address.',
        input.globalStatus,
        input.addressComplete,
        input.rejectionReason,
      ),
      this.createSectionProgress(
        KycSectionCode.LIVENESS,
        'Liveness',
        'Complete the liveness or selfie verification step.',
        input.globalStatus,
        input.livenessComplete,
        input.rejectionReason,
      ),
    ];
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

  private buildDynamicLimits(
    resolution: RegionResolution,
    isKycVerified: boolean,
    hasTransactionPin: boolean,
    canTransfer: boolean,
    productAvailability: ProductAvailability,
  ): DynamicLimitProfile {
    const tier =
      resolution.state === 'UNSUPPORTED'
        ? 'UNSUPPORTED'
        : isKycVerified
          ? 'VERIFIED'
          : 'PENDING_KYC';

    const transferManagedBy =
      resolution.state !== 'RESOLVED'
        ? 'REGION_GATE'
        : !isKycVerified
          ? 'KYC_GATE'
          : !hasTransactionPin
            ? 'PIN_GATE'
            : 'FUTURE_PROGRESSIVE_POLICY';

    return {
      policyVersion: 'staging-region-products-v2',
      tier,
      outbound: {
        daily: canTransfer ? null : 0,
        monthly: canTransfer ? null : 0,
        currency: 'MIXED',
        managedBy: transferManagedBy,
      },
      inbound: {
        daily: null,
        monthly: null,
        currency: 'MIXED',
        managedBy: 'RECEIVE_ENABLED_BY_DEFAULT',
      },
      receive: {
        dailyAmount: null,
        monthlyAmount: null,
        managedBy: 'RECEIVE_ENABLED_BY_DEFAULT',
      },
      transfer: {
        dailyAmount: canTransfer ? null : 0,
        monthlyAmount: canTransfer ? null : 0,
        managedBy: transferManagedBy,
      },
      progressiveIncreases: {
        enabled: canTransfer,
        basis: 'ACCOUNT_ACTIVITY',
        reviewRequired: true,
      },
      futureProducts: {
        loanEligible: productAvailability.loan,
        taxFilingEligible: productAvailability.taxFiling,
      },
      lastEvaluatedAt: new Date().toISOString(),
      trustSignals: {
        transactionVolume: null,
        transactionConsistency: null,
        activeDurationDays: null,
      },
    };
  }

  private buildProductAvailability(
    resolution: RegionResolution,
    canTransfer: boolean,
  ): ProductAvailability {
    const baseAvailability: ProductAvailability = {
      wallet: true,
      transfer: false,
      deposit: false,
      cardTopUp: false,
      conversion: false,
      airtime: false,
      data: false,
      utilities: false,
      loan: false,
      taxFiling: false,
      crypto: false,
    };

    if (resolution.state !== 'RESOLVED' || !resolution.region) {
      return baseAvailability;
    }

    if (resolution.region === SupportedRegion.NG) {
      return {
        ...baseAvailability,
        deposit: true,
        cardTopUp: true,
        conversion: true,
        transfer: canTransfer,
        airtime: true,
        data: true,
        utilities: true,
      };
    }

    if (resolution.region === SupportedRegion.US) {
      return {
        ...baseAvailability,
        deposit: true,
        conversion: true,
        transfer: canTransfer,
        loan: true,
        taxFiling: true,
      };
    }

    return baseAvailability;
  }

  private createSectionProgress(
    section: KycSectionCode,
    title: string,
    description: string,
    globalStatus: ClientKycStatus,
    sectionComplete: boolean,
    rejectionReason: string | null,
  ): KycSectionProgress {
    if (globalStatus === ClientKycStatus.VERIFIED) {
      return {
        section,
        title,
        description,
        status: ClientKycStatus.VERIFIED,
        completed: true,
        rejectionReason: null,
      };
    }

    if (globalStatus === ClientKycStatus.UNDER_REVIEW) {
      return {
        section,
        title,
        description,
        status: sectionComplete
          ? ClientKycStatus.UNDER_REVIEW
          : ClientKycStatus.NOT_STARTED,
        completed: sectionComplete,
        rejectionReason: null,
      };
    }

    if (globalStatus === ClientKycStatus.REJECTED) {
      return {
        section,
        title,
        description,
        status: sectionComplete
          ? ClientKycStatus.REJECTED
          : ClientKycStatus.NOT_STARTED,
        completed: false,
        rejectionReason: sectionComplete ? rejectionReason : null,
      };
    }

    if (globalStatus === ClientKycStatus.SUBMITTED) {
      return {
        section,
        title,
        description,
        status: sectionComplete
          ? ClientKycStatus.SUBMITTED
          : ClientKycStatus.NOT_STARTED,
        completed: sectionComplete,
        rejectionReason: null,
      };
    }

    if (globalStatus === ClientKycStatus.IN_PROGRESS) {
      return {
        section,
        title,
        description,
        status: sectionComplete
          ? ClientKycStatus.SUBMITTED
          : ClientKycStatus.IN_PROGRESS,
        completed: sectionComplete,
        rejectionReason: null,
      };
    }

    return {
      section,
      title,
      description,
      status: ClientKycStatus.NOT_STARTED,
      completed: false,
      rejectionReason: null,
    };
  }
}
