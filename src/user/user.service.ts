import {
  BadRequestException,
  Injectable,
  PreconditionFailedException,
} from '@nestjs/common';
import {
  KycDocumentStage,
  KycDocumentStorage,
} from 'src/common/enum/kyc-document.enum';
import { KycStatus } from 'src/common/enum/kyc-status.enum';
import { SupportedRegion } from 'src/common/enum/supported-region.enum';
import {
  KycAddressSnapshot,
  KycIdentitySnapshot,
  KycLivenessSnapshot,
  UserKyc,
} from 'src/database/entities/user-kyc.entity';
import { User } from 'src/database/entities/user.entity';
import { KycDocumentRepository } from 'src/database/repositories/kyc-document.repository';
import { UserKycRepository } from 'src/database/repositories/user-kyc.repository';
import { UserRepository } from 'src/database/repositories/user.repository';
import { WalletRepository } from 'src/database/repositories/wallet.repository';
import { KycProviderRouterService } from 'src/integrations/kyc/kyc-provider-router.service';
import { API_MESSAGES } from 'src/utils/apiMessages';
import { SubmitKycDto } from './dto/submit-kyc.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UploadKycDocumentsDto } from './dto/upload-kyc-documents.dto';
import { UpsertKycAddressDto } from './dto/upsert-kyc-address.dto';
import { UpsertKycIdentityDto } from './dto/upsert-kyc-identity.dto';
import { UpsertKycLivenessDto } from './dto/upsert-kyc-liveness.dto';
import { UserCapabilities } from './interfaces/user-capability.interface';
import { UserPolicyService } from './user-policy.service';
import { relative } from 'path';

type UploadedKycFile = {
  originalname?: string;
  filename?: string;
  mimetype?: string;
  size?: number;
  path?: string;
};

@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly userKycRepository: UserKycRepository,
    private readonly kycDocumentRepository: KycDocumentRepository,
    private readonly walletRepository: WalletRepository,
    private readonly userPolicy: UserPolicyService,
    private readonly kycProviderRouter: KycProviderRouterService,
  ) {}

  async getMe(userId: string) {
    const { user, capabilities } = await this.getSyncedContext(userId);

    return {
      user: this.serializeProfile(user),
      capabilities,
    };
  }

  async getKyc(userId: string) {
    const { user, capabilities } = await this.getSyncedContext(userId);
    return this.buildKycResponse(user, capabilities);
  }

  async updateProfile(userId: string, updateProfileDto: UpdateProfileDto) {
    const user = await this.loadUserContext(userId);
    const profilePatch = this.buildProfilePatch(updateProfileDto);

    if (!Object.keys(profilePatch).length) {
      return this.getMe(userId);
    }

    const regionResolution = this.userPolicy.resolveRegion({
      country:
        (profilePatch.country as string | null | undefined) ?? user.country ?? null,
      countryCode:
        (profilePatch.countryCode as string | null | undefined) ??
        user.countryCode ??
        null,
      residency:
        (profilePatch.residency as string | null | undefined) ??
        user.residency ??
        null,
    });

    const provider = regionResolution.region
      ? this.kycProviderRouter.mapRegionToProvider(regionResolution.region)
      : null;
    const currentStatus =
      user.kyc?.status ?? user.kycStatus ?? KycStatus.NOT_STARTED;
    let nextStatus = currentStatus;
    let nextBlockedReason =
      user.kyc?.blockedReason ??
      this.userPolicy.mapKycStatusToBlockedReason(currentStatus);

    if (regionResolution.state === 'UNSUPPORTED') {
      nextStatus = KycStatus.UNSUPPORTED;
      nextBlockedReason =
        regionResolution.blockedReason ?? API_MESSAGES.KYC_UNSUPPORTED_REGION;
    } else if (currentStatus === KycStatus.UNSUPPORTED) {
      nextStatus = this.hasCollectedKycData(user, profilePatch, user.kyc)
        ? KycStatus.DRAFT
        : KycStatus.NOT_STARTED;
      nextBlockedReason =
        regionResolution.blockedReason ??
        this.userPolicy.mapKycStatusToBlockedReason(nextStatus);
    }

    const userSubmittedAt =
      currentStatus === nextStatus ||
      nextStatus === KycStatus.PENDING_REVIEW ||
      nextStatus === KycStatus.VERIFIED
        ? user.kycSubmittedAt
        : null;
    const userReviewedAt =
      currentStatus === nextStatus || nextStatus === KycStatus.VERIFIED
        ? user.kycReviewedAt
        : null;

    await this.userRepository.findOneAndUpdate(userId, {
      ...profilePatch,
      kycStatus: nextStatus,
      kycProvider: provider,
      kycSubmittedAt: userSubmittedAt,
      kycReviewedAt: userReviewedAt,
    });

    const userKyc = await this.ensureUserKyc(user);
    await this.userKycRepository.findOneAndUpdate(userKyc.id, {
      country:
        (profilePatch.country as string | null | undefined) ?? userKyc.country ?? null,
      countryCode:
        (profilePatch.countryCode as string | null | undefined) ??
        userKyc.countryCode ??
        null,
      provider,
      status: nextStatus,
      blockedReason: nextBlockedReason,
      reviewedAt:
        currentStatus === nextStatus || nextStatus === KycStatus.VERIFIED
          ? userKyc.reviewedAt
          : null,
      submittedAt:
        currentStatus === nextStatus ||
        nextStatus === KycStatus.PENDING_REVIEW ||
        nextStatus === KycStatus.VERIFIED
          ? userKyc.submittedAt
          : null,
    });

    return this.getMe(userId);
  }

  async saveKycIdentity(userId: string, upsertKycIdentityDto: UpsertKycIdentityDto) {
    const user = await this.loadUserContext(userId);
    const userKyc = await this.ensureUserKyc(user);
    const region = this.resolveSupportedRegionOrThrow(user, userKyc);

    this.userPolicy.validateIdentityPayloadForRegion(region, upsertKycIdentityDto);

    const identityData: KycIdentitySnapshot = {
      nin:
        this.userPolicy.normalizeOptionalString(upsertKycIdentityDto.nin) ??
        userKyc.identityData?.nin ??
        null,
      bvn:
        this.userPolicy.normalizeOptionalString(upsertKycIdentityDto.bvn) ??
        userKyc.identityData?.bvn ??
        null,
      ssn:
        this.userPolicy.normalizeOptionalString(upsertKycIdentityDto.ssn) ??
        userKyc.identityData?.ssn ??
        null,
      approvedIdentityType:
        this.userPolicy.normalizeOptionalString(
          upsertKycIdentityDto.approvedIdentityType,
        ) ??
        userKyc.identityData?.approvedIdentityType ??
        null,
      approvedIdentityValue:
        this.userPolicy.normalizeOptionalString(
          upsertKycIdentityDto.approvedIdentityValue,
        ) ??
        userKyc.identityData?.approvedIdentityValue ??
        null,
      metadata:
        upsertKycIdentityDto.metadata ?? userKyc.identityData?.metadata ?? null,
    };

    await this.moveKycToDraft(user, userKyc, region, {
      identityData,
    });

    return this.getKyc(userId);
  }

  async saveKycAddress(userId: string, upsertKycAddressDto: UpsertKycAddressDto) {
    const user = await this.loadUserContext(userId);
    const userKyc = await this.ensureUserKyc(user);
    const region = this.resolveSupportedRegionOrThrow(user, userKyc, {
      country: upsertKycAddressDto.country,
      countryCode: upsertKycAddressDto.countryCode,
    });

    const addressData = this.userPolicy.buildAddressSnapshotFromSources(
      {
        addressLine1: this.userPolicy.normalizeOptionalString(
          upsertKycAddressDto.addressLine1,
        ),
        addressLine2: this.userPolicy.normalizeOptionalString(
          upsertKycAddressDto.addressLine2,
        ),
        city: this.userPolicy.normalizeOptionalString(upsertKycAddressDto.city),
        stateOrRegion: this.userPolicy.normalizeOptionalString(
          upsertKycAddressDto.stateOrRegion,
        ),
        postalCode: this.userPolicy.normalizeOptionalString(
          upsertKycAddressDto.postalCode,
        ),
        country: this.userPolicy.normalizeOptionalString(
          upsertKycAddressDto.country,
        ),
        countryCode: this.normalizeCountryCode(
          upsertKycAddressDto.countryCode,
        ),
      },
      userKyc.addressData ?? this.getUserAddressSnapshot(user),
    );

    const provider = this.kycProviderRouter.mapRegionToProvider(region);
    const nextStatus = this.getNextDraftStatus(userKyc.status);

    await this.userRepository.findOneAndUpdate(user.id, {
      addressLine1: addressData.addressLine1 ?? undefined,
      addressLine2: addressData.addressLine2 ?? undefined,
      city: addressData.city ?? undefined,
      stateOrRegion: addressData.stateOrRegion ?? undefined,
      postalCode: addressData.postalCode ?? undefined,
      country: addressData.country ?? undefined,
      countryCode: addressData.countryCode ?? undefined,
      kycStatus: nextStatus,
      kycProvider: provider,
      kycSubmittedAt: null,
      kycReviewedAt: null,
    });

    await this.userKycRepository.findOneAndUpdate(userKyc.id, {
      addressData,
      country: addressData.country ?? userKyc.country ?? null,
      countryCode: addressData.countryCode ?? userKyc.countryCode ?? null,
      provider,
      status: nextStatus,
      blockedReason: this.userPolicy.mapKycStatusToBlockedReason(nextStatus),
      submittedAt: null,
      reviewedAt: null,
      providerResponse: null,
      submissionReference: null,
    });

    return this.getKyc(userId);
  }

  async saveKycLiveness(
    userId: string,
    upsertKycLivenessDto: UpsertKycLivenessDto,
  ) {
    const user = await this.loadUserContext(userId);
    const userKyc = await this.ensureUserKyc(user);
    const region = this.resolveSupportedRegionOrThrow(user, userKyc);

    const livenessData: KycLivenessSnapshot = {
      sessionId:
        this.userPolicy.normalizeOptionalString(upsertKycLivenessDto.sessionId) ??
        userKyc.livenessData?.sessionId ??
        null,
      providerReference:
        this.userPolicy.normalizeOptionalString(
          upsertKycLivenessDto.providerReference,
        ) ??
        userKyc.livenessData?.providerReference ??
        null,
      outcome:
        this.userPolicy.normalizeOptionalString(upsertKycLivenessDto.outcome) ??
        userKyc.livenessData?.outcome ??
        null,
      completed:
        upsertKycLivenessDto.completed ??
        userKyc.livenessData?.completed ??
        false,
      metadata:
        upsertKycLivenessDto.metadata ?? userKyc.livenessData?.metadata ?? null,
    };

    if (
      !this.userPolicy.hasAnyValue([
        livenessData.sessionId,
        livenessData.providerReference,
        livenessData.outcome,
        livenessData.completed,
        livenessData.metadata,
      ])
    ) {
      throw new BadRequestException(API_MESSAGES.KYC_LIVENESS_INCOMPLETE);
    }

    await this.moveKycToDraft(user, userKyc, region, {
      livenessData,
    });

    return this.getKyc(userId);
  }

  async saveKycDocuments(
    userId: string,
    files: UploadedKycFile[] = [],
    uploadKycDocumentsDto: UploadKycDocumentsDto,
  ) {
    const user = await this.loadUserContext(userId);
    const userKyc = await this.ensureUserKyc(user);
    const metadata = this.parseDocumentMetadata(uploadKycDocumentsDto.metadata);
    const fileUrls = (uploadKycDocumentsDto.fileUrls ?? [])
      .map((fileUrl) => this.userPolicy.normalizeOptionalString(fileUrl))
      .filter((fileUrl): fileUrl is string => Boolean(fileUrl));

    if ((!files || !files.length) && !fileUrls.length) {
      throw new BadRequestException(API_MESSAGES.KYC_DOCUMENT_REQUIRED);
    }

    const stage = uploadKycDocumentsDto.stage ?? KycDocumentStage.SUPPORTING;
    const documentType =
      this.userPolicy.normalizeOptionalString(
        uploadKycDocumentsDto.documentType,
      ) ?? null;

    for (const file of files ?? []) {
      await this.kycDocumentRepository.create({
        userId,
        kycId: userKyc.id,
        stage,
        documentType,
        originalFileName: file.originalname ?? null,
        storedFileName: file.filename ?? null,
        mimeType: file.mimetype ?? null,
        sizeBytes: file.size ?? null,
        storage: KycDocumentStorage.LOCAL,
        localPath: file.path ?? null,
        fileUrl: this.buildLocalFileUrl(file.path),
        uploadedViaBackend: true,
        metadata,
      });
    }

    for (const fileUrl of fileUrls) {
      await this.kycDocumentRepository.create({
        userId,
        kycId: userKyc.id,
        stage,
        documentType,
        originalFileName: null,
        storedFileName: null,
        mimeType: null,
        sizeBytes: null,
        storage: KycDocumentStorage.REMOTE,
        localPath: null,
        fileUrl,
        uploadedViaBackend: false,
        metadata,
      });
    }

    const regionResolution = this.userPolicy.resolveRegionForUser(user, userKyc);
    const nextStatus =
      regionResolution.state === 'UNSUPPORTED'
        ? KycStatus.UNSUPPORTED
        : this.getNextDraftStatus(userKyc.status);
    const provider = regionResolution.region
      ? this.kycProviderRouter.mapRegionToProvider(regionResolution.region)
      : null;

    await this.userKycRepository.findOneAndUpdate(userKyc.id, {
      provider,
      status: nextStatus,
      blockedReason:
        regionResolution.blockedReason ??
        this.userPolicy.mapKycStatusToBlockedReason(nextStatus),
      submittedAt: null,
      reviewedAt: null,
      providerResponse: null,
      submissionReference: null,
    });

    await this.userRepository.findOneAndUpdate(user.id, {
      kycStatus: nextStatus,
      kycProvider: provider,
      kycSubmittedAt: null,
      kycReviewedAt: null,
    });

    return this.getKyc(userId);
  }

  async submitKyc(userId: string, _submitKycDto: SubmitKycDto) {
    const user = await this.loadUserContext(userId);
    const userKyc = await this.ensureUserKyc(user);
    const region = this.resolveSupportedRegionOrThrow(user, userKyc);
    const provider = this.kycProviderRouter.mapRegionToProvider(region);

    if (!provider) {
      throw new BadRequestException(API_MESSAGES.KYC_PROVIDER_UNAVAILABLE);
    }

    const effectiveAddress = this.userPolicy.buildAddressSnapshotFromSources(
      userKyc.addressData ?? undefined,
      this.getUserAddressSnapshot(user),
    );
    const submissionKyc = {
      ...userKyc,
      addressData: effectiveAddress,
      country: effectiveAddress.country ?? userKyc.country ?? user.country ?? null,
      countryCode:
        effectiveAddress.countryCode ??
        userKyc.countryCode ??
        user.countryCode ??
        region,
      provider,
    } as UserKyc;

    this.userPolicy.validateStoredKycForSubmission(region, submissionKyc);

    const submissionResult = await this.kycProviderRouter.submitKyc(region, {
      user,
      kyc: submissionKyc,
      region,
    });

    if (!submissionResult) {
      throw new BadRequestException(API_MESSAGES.KYC_PROVIDER_UNAVAILABLE);
    }

    const submittedAt = new Date();
    const reviewedAt =
      submissionResult.status === KycStatus.VERIFIED ? new Date() : null;

    await this.userKycRepository.findOneAndUpdate(userKyc.id, {
      status: submissionResult.status,
      provider: submissionResult.provider,
      country: submissionKyc.country,
      countryCode: submissionKyc.countryCode,
      addressData: effectiveAddress,
      blockedReason:
        submissionResult.blockedReason ??
        this.userPolicy.mapKycStatusToBlockedReason(submissionResult.status),
      providerResponse: submissionResult.providerResponse,
      submissionReference: submissionResult.submissionReference,
      submittedAt,
      reviewedAt,
    });

    await this.userRepository.findOneAndUpdate(user.id, {
      addressLine1:
        effectiveAddress.addressLine1 ?? user.addressLine1 ?? undefined,
      addressLine2:
        effectiveAddress.addressLine2 ?? user.addressLine2 ?? undefined,
      city: effectiveAddress.city ?? user.city ?? undefined,
      stateOrRegion:
        effectiveAddress.stateOrRegion ?? user.stateOrRegion ?? undefined,
      postalCode: effectiveAddress.postalCode ?? user.postalCode ?? undefined,
      country: submissionKyc.country ?? undefined,
      countryCode: submissionKyc.countryCode ?? undefined,
      kycStatus: submissionResult.status,
      kycProvider: submissionResult.provider,
      kycSubmittedAt: submittedAt,
      kycReviewedAt: reviewedAt,
    });

    return this.getKyc(userId);
  }

  async ensureCanTransfer(userId: string) {
    const user = await this.loadUserContext(userId);
    const capabilities = this.userPolicy.computeCapabilities(user);

    if (!capabilities.canTransfer) {
      await this.syncWalletRouting(userId, capabilities);
      throw new PreconditionFailedException(
        capabilities.blockedReason ?? API_MESSAGES.TRANSFER_BLOCKED_PENDING_KYC,
      );
    }

    await this.syncWalletRouting(userId, capabilities);
    return capabilities;
  }

  private async getSyncedContext(userId: string) {
    const user = await this.loadUserContext(userId);
    const capabilities = this.userPolicy.computeCapabilities(user);
    await this.syncWalletRouting(userId, capabilities);

    return { user, capabilities };
  }

  private async loadUserContext(userId: string): Promise<User> {
    const user = await this.userRepository.getUserProfileContext(userId);
    if (user.kyc) {
      return user;
    }

    await this.userKycRepository.getOrCreateForUser(user);
    return this.userRepository.getUserProfileContext(userId);
  }

  private async ensureUserKyc(user: User): Promise<UserKyc> {
    if (user.kyc) {
      return user.kyc;
    }

    return this.userKycRepository.getOrCreateForUser(user);
  }

  private async moveKycToDraft(
    user: User,
    userKyc: UserKyc,
    region: SupportedRegion,
    kycPatch: Partial<UserKyc>,
  ) {
    const provider = this.kycProviderRouter.mapRegionToProvider(region);
    const nextStatus = this.getNextDraftStatus(userKyc.status);

    await this.userKycRepository.findOneAndUpdate(userKyc.id, {
      ...kycPatch,
      provider,
      country:
        userKyc.country ?? userKyc.addressData?.country ?? user.country ?? null,
      countryCode:
        userKyc.countryCode ??
        userKyc.addressData?.countryCode ??
        user.countryCode ??
        region,
      status: nextStatus,
      blockedReason: this.userPolicy.mapKycStatusToBlockedReason(nextStatus),
      submittedAt: null,
      reviewedAt: null,
      providerResponse: null,
      submissionReference: null,
    });

    await this.userRepository.findOneAndUpdate(user.id, {
      kycStatus: nextStatus,
      kycProvider: provider,
      kycSubmittedAt: null,
      kycReviewedAt: null,
    });
  }

  private getNextDraftStatus(currentStatus: KycStatus | null | undefined) {
    return this.userPolicy.nextDraftStatus(
      currentStatus ?? KycStatus.NOT_STARTED,
    );
  }

  private resolveSupportedRegionOrThrow(
    user: User,
    userKyc?: UserKyc | null,
    overrides?: {
      country?: string | null;
      countryCode?: string | null;
      residency?: string | null;
    },
  ): SupportedRegion {
    const resolution = this.userPolicy.resolveRegion({
      country:
        overrides?.country ??
        user.country ??
        userKyc?.country ??
        userKyc?.addressData?.country ??
        null,
      countryCode:
        this.normalizeCountryCode(overrides?.countryCode) ??
        this.normalizeCountryCode(user.countryCode) ??
        this.normalizeCountryCode(userKyc?.countryCode) ??
        this.normalizeCountryCode(userKyc?.addressData?.countryCode) ??
        null,
      residency: overrides?.residency ?? user.residency ?? null,
    });

    if (resolution.state !== 'RESOLVED' || !resolution.region) {
      throw new BadRequestException(
        resolution.blockedReason ?? API_MESSAGES.KYC_REGION_REQUIRED,
      );
    }

    return resolution.region;
  }

  private buildProfilePatch(updateProfileDto: UpdateProfileDto): Partial<User> {
    const profilePatch: Partial<User> = {};

    if (updateProfileDto.firstName !== undefined) {
      profilePatch.firstName =
        this.userPolicy.normalizeOptionalString(updateProfileDto.firstName) ??
        undefined;
    }

    if (updateProfileDto.lastName !== undefined) {
      profilePatch.lastName =
        this.userPolicy.normalizeOptionalString(updateProfileDto.lastName) ??
        undefined;
    }

    if (updateProfileDto.phoneNumber !== undefined) {
      profilePatch.phoneNumber =
        this.userPolicy.normalizeOptionalString(updateProfileDto.phoneNumber) ??
        undefined;
    }

    if (updateProfileDto.dateOfBirth !== undefined) {
      profilePatch.dateOfBirth = updateProfileDto.dateOfBirth ?? undefined;
    }

    if (updateProfileDto.profilePicture !== undefined) {
      profilePatch.profilePicture =
        this.userPolicy.normalizeOptionalString(updateProfileDto.profilePicture) ??
        undefined;
    }

    if (updateProfileDto.country !== undefined) {
      profilePatch.country =
        this.userPolicy.normalizeOptionalString(updateProfileDto.country) ??
        undefined;
    }

    if (updateProfileDto.countryCode !== undefined) {
      profilePatch.countryCode =
        this.normalizeCountryCode(updateProfileDto.countryCode) ?? undefined;
    }

    if (updateProfileDto.residency !== undefined) {
      profilePatch.residency =
        this.userPolicy.normalizeOptionalString(updateProfileDto.residency) ??
        undefined;
    }

    if (updateProfileDto.stateOrRegion !== undefined) {
      profilePatch.stateOrRegion =
        this.userPolicy.normalizeOptionalString(updateProfileDto.stateOrRegion) ??
        undefined;
    }

    if (updateProfileDto.city !== undefined) {
      profilePatch.city =
        this.userPolicy.normalizeOptionalString(updateProfileDto.city) ??
        undefined;
    }

    if (updateProfileDto.addressLine1 !== undefined) {
      profilePatch.addressLine1 =
        this.userPolicy.normalizeOptionalString(updateProfileDto.addressLine1) ??
        undefined;
    }

    if (updateProfileDto.addressLine2 !== undefined) {
      profilePatch.addressLine2 =
        this.userPolicy.normalizeOptionalString(updateProfileDto.addressLine2) ??
        undefined;
    }

    if (updateProfileDto.postalCode !== undefined) {
      profilePatch.postalCode =
        this.userPolicy.normalizeOptionalString(updateProfileDto.postalCode) ??
        undefined;
    }

    if (updateProfileDto.nationality !== undefined) {
      profilePatch.nationality =
        this.userPolicy.normalizeOptionalString(updateProfileDto.nationality) ??
        undefined;
    }

    return profilePatch;
  }

  private getUserAddressSnapshot(user: User): Partial<KycAddressSnapshot> {
    return {
      addressLine1: user.addressLine1 ?? null,
      addressLine2: user.addressLine2 ?? null,
      city: user.city ?? null,
      stateOrRegion: user.stateOrRegion ?? null,
      postalCode: user.postalCode ?? null,
      country: user.country ?? null,
      countryCode: user.countryCode ?? null,
    };
  }

  private hasCollectedKycData(
    user: User,
    profilePatch?: Partial<User>,
    userKyc?: UserKyc | null,
  ) {
    const addressSnapshot = this.userPolicy.buildAddressSnapshotFromSources(
      userKyc?.addressData ?? undefined,
      {
        addressLine1:
          (profilePatch?.addressLine1 as string | null | undefined) ??
          user.addressLine1 ??
          null,
        addressLine2:
          (profilePatch?.addressLine2 as string | null | undefined) ??
          user.addressLine2 ??
          null,
        city:
          (profilePatch?.city as string | null | undefined) ?? user.city ?? null,
        stateOrRegion:
          (profilePatch?.stateOrRegion as string | null | undefined) ??
          user.stateOrRegion ??
          null,
        postalCode:
          (profilePatch?.postalCode as string | null | undefined) ??
          user.postalCode ??
          null,
        country:
          (profilePatch?.country as string | null | undefined) ??
          user.country ??
          null,
        countryCode:
          (profilePatch?.countryCode as string | null | undefined) ??
          user.countryCode ??
          null,
      },
    );

    return this.userPolicy.hasAnyValue([
      userKyc?.identityData ?? null,
      userKyc?.livenessData ?? null,
      addressSnapshot.addressLine1,
      addressSnapshot.city,
      addressSnapshot.stateOrRegion,
      addressSnapshot.postalCode,
      addressSnapshot.country,
      addressSnapshot.countryCode,
      (userKyc?.documents?.length ?? user.kycDocuments?.length ?? 0) > 0
        ? 'documents'
        : null,
    ]);
  }

  private buildKycResponse(user: User, capabilities: UserCapabilities) {
    const userKyc = user.kyc;
    const regionResolution = this.userPolicy.resolveRegionForUser(user, userKyc);
    const address = this.userPolicy.buildAddressSnapshotFromSources(
      userKyc?.addressData ?? undefined,
      this.getUserAddressSnapshot(user),
    );

    return {
      status: userKyc?.status ?? user.kycStatus,
      provider: capabilities.provider ?? userKyc?.provider ?? user.kycProvider,
      region: capabilities.region,
      regionState: regionResolution.state,
      blockedReason:
        capabilities.blockedReason ??
        userKyc?.blockedReason ??
        this.userPolicy.mapKycStatusToBlockedReason(
          userKyc?.status ?? user.kycStatus,
        ),
      submittedAt: userKyc?.submittedAt ?? user.kycSubmittedAt,
      reviewedAt: userKyc?.reviewedAt ?? user.kycReviewedAt,
      requirements: this.userPolicy.buildKycRequirements(capabilities.region),
      identity: this.userPolicy.maskIdentityData(userKyc?.identityData ?? null),
      address,
      liveness: userKyc?.livenessData ?? null,
      documents: this.userPolicy.serializeDocuments(
        userKyc?.documents ?? user.kycDocuments ?? [],
      ),
      capabilities,
      profile: this.serializeProfile(user),
    };
  }

  private serializeProfile(user: User) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      dateOfBirth: user.dateOfBirth,
      profilePicture: user.profilePicture,
      tagId: user.tagId,
      role: user.role,
      status: user.status,
      isVerified: user.isVerified,
      isPhoneVerified: user.isPhoneVerified,
      country: user.country,
      countryCode: user.countryCode,
      residency: user.residency,
      stateOrRegion: user.stateOrRegion,
      city: user.city,
      addressLine1: user.addressLine1,
      addressLine2: user.addressLine2,
      postalCode: user.postalCode,
      nationality: user.nationality,
      kycStatus: user.kyc?.status ?? user.kycStatus,
      kycProvider: user.kyc?.provider ?? user.kycProvider,
      kycSubmittedAt: user.kyc?.submittedAt ?? user.kycSubmittedAt,
      kycReviewedAt: user.kyc?.reviewedAt ?? user.kycReviewedAt,
      wallets: (user.wallet ?? []).map((wallet) => ({
        id: wallet.id,
        currency: wallet.currency,
        balance: wallet.balance,
        accountNumber: wallet.accountNumber,
        routingNumber: wallet.routingNumber,
        accountName: wallet.accountName,
        bankName: wallet.bankName,
        sortCode: wallet.sortCode,
        receiveEnabled: wallet.receiveEnabled,
        transferEnabled: wallet.transferEnabled,
        routingRegionCode: wallet.routingRegionCode,
        routingProvider: wallet.routingProvider,
        providerCustomerId: wallet.providerCustomerId,
        providerAccountId: wallet.providerAccountId,
        providerVirtualAccountId: wallet.providerVirtualAccountId,
        providerReference: wallet.providerReference,
        providerMetadata: wallet.providerMetadata,
      })),
    };
  }

  private parseDocumentMetadata(metadata?: string | null) {
    const normalized = this.userPolicy.normalizeOptionalString(metadata);
    if (!normalized) {
      return null;
    }

    try {
      return JSON.parse(normalized);
    } catch (_error) {
      throw new BadRequestException(
        'Invalid KYC document metadata. Expected valid JSON.',
      );
    }
  }

  private buildLocalFileUrl(filePath?: string | null) {
    const normalized = this.userPolicy.normalizeOptionalString(filePath);
    if (!normalized) {
      return null;
    }

    const relativePath = relative(process.cwd(), normalized).replace(/\\/g, '/');
    return `/${relativePath}`;
  }

  private normalizeCountryCode(value?: string | null) {
    const normalized = this.userPolicy.normalizeOptionalString(value);
    return normalized ? normalized.toUpperCase() : null;
  }

  private async syncWalletRouting(
    userId: string,
    capabilities: UserCapabilities,
  ) {
    await this.walletRepository.syncRoutingForUser(userId, {
      receiveEnabled: capabilities.canReceive,
      transferEnabled: capabilities.canTransfer,
      routingRegionCode: capabilities.region,
      routingProvider: capabilities.provider,
    });
  }
}
