import {
  BadRequestException,
  Injectable,
  PreconditionFailedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ClientKycStatus } from 'src/common/enum/client-kyc-status.enum';
import {
  KycDocumentStage,
  KycDocumentStorage,
} from 'src/common/enum/kyc-document.enum';
import { KycProvider } from 'src/common/enum/kyc-provider.enum';
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
import { KycDocument } from 'src/database/entities/kyc-document.entity';
import { KycProviderRouterService } from 'src/integrations/kyc/kyc-provider-router.service';
import { ProviderOperationsService } from 'src/integrations/provider/provider-operations.service';
import { API_MESSAGES } from 'src/utils/apiMessages';
import { TokenType } from 'src/common/enum/token-type.enum';
import { SubmitKycDto } from './dto/submit-kyc.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UploadKycDocumentsDto } from './dto/upload-kyc-documents.dto';
import { UpsertKycAddressDto } from './dto/upsert-kyc-address.dto';
import { UpsertKycIdentityDto } from './dto/upsert-kyc-identity.dto';
import { UpsertKycLivenessDto } from './dto/upsert-kyc-liveness.dto';
import {
  FundingMethodAvailability,
  KycSectionProgress,
  WalletRailDetails,
} from './interfaces/user-account.interface';
import { UserCapabilities } from './interfaces/user-capability.interface';
import { UserPolicyService } from './user-policy.service';
import { relative } from 'path';
import { Currency } from 'src/utils/enums/wallet.enum';
import { TokensService } from 'src/tokens/tokens.service';
import { MailService } from 'src/mail/mail.service';
import { RequestEmailChangeDto } from './dto/request-email-change.dto';
import { VerifyEmailChangeDto } from './dto/verify-email-change.dto';
import { RequestPhoneChangeDto } from './dto/request-phone-change.dto';
import { VerifyPhoneChangeDto } from './dto/verify-phone-change.dto';

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
    private readonly providerOperationsService: ProviderOperationsService,
    private readonly tokensService: TokensService,
    private readonly mailService: MailService,
  ) {}

  async getMe(userId: string) {
    return this.getAccountOverview(userId);
  }

  async getSecurityOverview(userId: string) {
    const { user, capabilities } = await this.getSyncedContext(userId);

    return {
      email: user.email,
      phoneNumber: user.phoneNumber,
      emailVerified: user.isVerified,
      phoneVerified: user.isPhoneVerified,
      authType: user.authType,
      lastLogin: user.lastLogin,
      hasTransactionPin: capabilities.hasTransactionPin,
      requiresTransactionPinSetup: !capabilities.hasTransactionPin,
      biometricManagedByDevice: true,
      transactionPinRequiredFor: [
        'INTERNAL_TRANSFER',
        'EXTERNAL_TRANSFER',
        'AIRTIME',
        'DATA',
        'UTILITIES',
      ],
      policy: {
        approvalModel: 'PIN_REQUIRED_FOR_OUTGOING_WALLET_ACTIONS',
        biometricAssistance: 'DEVICE_MANAGED',
      },
      availableActions: {
        createTransactionPin: !capabilities.hasTransactionPin,
        resetTransactionPin: capabilities.hasTransactionPin,
        changeEmail: true,
        changePhone: true,
      },
    };
  }

  async requestEmailChange(
    userId: string,
    requestEmailChangeDto: RequestEmailChangeDto,
  ) {
    const user = await this.loadUserContext(userId);
    const newEmail =
      this.userPolicy.normalizeOptionalString(requestEmailChangeDto.newEmail)?.toLowerCase() ??
      null;

    if (!newEmail) {
      throw new BadRequestException('A valid email address is required.');
    }

    if (newEmail === user.email?.toLowerCase()) {
      throw new BadRequestException('Enter a different email address to continue.');
    }

    const existingUser = await this.userRepository.findUserByEmail(newEmail);
    if (existingUser) {
      throw new BadRequestException(API_MESSAGES.EMAIL_ALREADY_EXISTS);
    }

    await this.tokensService.deleteTokensByUserAndType(userId, TokenType.EMAIL_CHANGE);

    const verificationToken = this.generateSixDigitToken();
    const tokenExpiration = new Date();
    tokenExpiration.setHours(tokenExpiration.getHours() + 1);

    const tokenRecord = await this.tokensService.create({
      token: verificationToken,
      expiration: tokenExpiration,
      type: TokenType.EMAIL_CHANGE,
      user,
      metadata: {
        newEmail,
      },
    });

    const delivery = await this.mailService.sendEmailVerificationCodeToEmail({
      email: newEmail,
      otp: verificationToken,
      firstName: user.firstName ?? user.lastName ?? 'there',
    });

    if (!delivery.delivered) {
      await this.tokensService.delete(tokenRecord.id);
      throw new ServiceUnavailableException(
        API_MESSAGES.CHANGE_CONTACT_VERIFICATION_FAILED,
      );
    }

    return {
      message: API_MESSAGES.EMAIL_CHANGE_CODE_SENT,
      expiresAt: tokenExpiration.toISOString(),
    };
  }

  async verifyEmailChange(
    userId: string,
    verifyEmailChangeDto: VerifyEmailChangeDto,
  ) {
    const validToken = await this.tokensService.findOneByTokenAndValidate(
      verifyEmailChangeDto.token,
      TokenType.EMAIL_CHANGE,
      userId,
    );

    if (!validToken) {
      throw new BadRequestException(API_MESSAGES.INVALID_TOKEN);
    }

    const newEmail = this.userPolicy
      .normalizeOptionalString(validToken.metadata?.newEmail)
      ?.toLowerCase();

    if (!newEmail) {
      await this.tokensService.delete(validToken.id);
      throw new BadRequestException(API_MESSAGES.INVALID_TOKEN);
    }

    const existingUser = await this.userRepository.findUserByEmail(newEmail);
    if (existingUser && existingUser.id !== userId) {
      await this.tokensService.delete(validToken.id);
      throw new BadRequestException(API_MESSAGES.EMAIL_ALREADY_EXISTS);
    }

    await this.userRepository.findOneAndUpdate(userId, {
      email: newEmail,
      isVerified: true,
    });
    await this.tokensService.delete(validToken.id);

    return {
      message: API_MESSAGES.EMAIL_CHANGE_SUCCESSFUL,
      security: await this.getSecurityOverview(userId),
    };
  }

  async requestPhoneChange(
    userId: string,
    requestPhoneChangeDto: RequestPhoneChangeDto,
  ) {
    const user = await this.loadUserContext(userId);
    const newPhoneNumber =
      this.userPolicy.normalizeOptionalString(
        requestPhoneChangeDto.newPhoneNumber,
      ) ?? null;

    if (!newPhoneNumber) {
      throw new BadRequestException('A valid phone number is required.');
    }

    if (newPhoneNumber === user.phoneNumber) {
      throw new BadRequestException('Enter a different phone number to continue.');
    }

    const existingUser = await this.userRepository.findUserByPhone(newPhoneNumber);
    if (existingUser) {
      throw new BadRequestException(API_MESSAGES.PHONE_ALREADY_EXISTS);
    }

    await this.tokensService.deleteTokensByUserAndType(userId, TokenType.PHONE_CHANGE);

    const verificationToken = this.generateSixDigitToken();
    const tokenExpiration = new Date();
    tokenExpiration.setHours(tokenExpiration.getHours() + 1);

    const tokenRecord = await this.tokensService.create({
      token: verificationToken,
      expiration: tokenExpiration,
      type: TokenType.PHONE_CHANGE,
      user,
      metadata: {
        newPhoneNumber,
      },
    });

    const delivery = await this.mailService.sendEmailVerificationCodeToEmail({
      email: user.email,
      otp: verificationToken,
      firstName: user.firstName ?? user.lastName ?? 'there',
    });

    if (!delivery.delivered) {
      await this.tokensService.delete(tokenRecord.id);
      throw new ServiceUnavailableException(
        API_MESSAGES.CHANGE_CONTACT_VERIFICATION_FAILED,
      );
    }

    return {
      message: API_MESSAGES.PHONE_CHANGE_CODE_SENT,
      expiresAt: tokenExpiration.toISOString(),
    };
  }

  async verifyPhoneChange(
    userId: string,
    verifyPhoneChangeDto: VerifyPhoneChangeDto,
  ) {
    const validToken = await this.tokensService.findOneByTokenAndValidate(
      verifyPhoneChangeDto.token,
      TokenType.PHONE_CHANGE,
      userId,
    );

    if (!validToken) {
      throw new BadRequestException(API_MESSAGES.INVALID_TOKEN);
    }

    const newPhoneNumber = this.userPolicy.normalizeOptionalString(
      validToken.metadata?.newPhoneNumber,
    );

    if (!newPhoneNumber) {
      await this.tokensService.delete(validToken.id);
      throw new BadRequestException(API_MESSAGES.INVALID_TOKEN);
    }

    const existingUser = await this.userRepository.findUserByPhone(newPhoneNumber);
    if (existingUser && existingUser.id !== userId) {
      await this.tokensService.delete(validToken.id);
      throw new BadRequestException(API_MESSAGES.PHONE_ALREADY_EXISTS);
    }

    await this.userRepository.findOneAndUpdate(userId, {
      phoneNumber: newPhoneNumber,
      isPhoneVerified: false,
    });
    await this.tokensService.delete(validToken.id);

    return {
      message: API_MESSAGES.PHONE_CHANGE_SUCCESSFUL,
      security: await this.getSecurityOverview(userId),
    };
  }

  async getKyc(userId: string) {
    const { user, capabilities } = await this.getSyncedContext(userId);
    return this.buildKycResponse(user, capabilities);
  }

  async getAccountOverview(userId: string) {
    const { user, capabilities } = await this.getSyncedContext(userId);
    const walletRails = this.buildWalletRailDetails(user, capabilities);
    const accountRails = this.buildAccountRailSummary(walletRails);
    const fundingMethods = this.buildFundingMethods(capabilities, walletRails);
    const pendingActions = this.buildPendingActions(user, capabilities, walletRails);
    const serializedProfile = this.serializeProfile(
      user,
      capabilities,
      walletRails,
      accountRails,
      fundingMethods,
    );

    return {
      user: serializedProfile,
      region: capabilities.region,
      provider: capabilities.provider,
      security: serializedProfile.security,
      capabilities,
      productAvailability: capabilities.productAvailability,
      limits: capabilities.limits,
      tier: capabilities.limits.tier,
      pendingActions,
      wallets: walletRails,
      accountRails,
      fundingMethods,
    };
  }

  async getHomeOverview(userId: string) {
    const overview = await this.getAccountOverview(userId);

    return {
      summary: {
        region: overview.region,
        provider: overview.provider,
        tier: overview.tier,
        wallets: overview.wallets,
        capabilities: overview.capabilities,
        productAvailability: overview.productAvailability,
      },
      pendingActions: overview.pendingActions,
      quickActions: {
        internalTransfer: overview.capabilities.canInternalTransfer,
        externalTransfer: overview.capabilities.canExternalTransfer,
        receive: overview.productAvailability.receive ?? overview.capabilities.canReceive,
        deposit: overview.productAvailability.deposit,
        cardTopUp: overview.productAvailability.cardTopUp,
        airtime: overview.productAvailability.airtime,
        data: overview.productAvailability.data,
        utilities: overview.productAvailability.utilities,
        conversion: overview.productAvailability.conversion,
      },
      marketSummary: this.buildMarketSummary(overview.region),
      promotions: this.buildHomePromotions(overview.user),
      fundingMethods: overview.fundingMethods,
      accountRails: overview.accountRails,
    };
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
      metadata: {
        ...(userKyc.identityData?.metadata ?? {}),
        ...(upsertKycIdentityDto.metadata ?? {}),
        governmentIdDocumentId:
          this.userPolicy.normalizeOptionalString(
            upsertKycIdentityDto.governmentIdDocumentId,
          ) ?? null,
        governmentIdDocumentUrl:
          this.userPolicy.normalizeOptionalString(
            upsertKycIdentityDto.governmentIdDocumentUrl,
          ) ?? null,
      },
    };

    await this.moveKycToDraft(user, userKyc, region, {
      identityData,
    });

    return this.getKyc(userId);
  }

  async saveKycAddress(userId: string, upsertKycAddressDto: UpsertKycAddressDto) {
    const user = await this.loadUserContext(userId);
    const userKyc = await this.ensureUserKyc(user);
    const normalizedCountryCode =
      this.normalizeCountryCode(upsertKycAddressDto.countryCode) ??
      this.userPolicy.parseSupportedRegion(upsertKycAddressDto.country ?? '') ??
      null;
    const normalizedStateOrRegion =
      this.userPolicy.normalizeOptionalString(
        upsertKycAddressDto.stateOrRegion,
      ) ??
      this.userPolicy.normalizeOptionalString(upsertKycAddressDto.state);
    const region = this.resolveSupportedRegionOrThrow(user, userKyc, {
      country: upsertKycAddressDto.country,
      countryCode: normalizedCountryCode,
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
        stateOrRegion: normalizedStateOrRegion,
        postalCode: this.userPolicy.normalizeOptionalString(
          upsertKycAddressDto.postalCode,
        ),
        country: this.userPolicy.normalizeOptionalString(
          upsertKycAddressDto.country,
        ),
        countryCode: normalizedCountryCode ?? region,
        metadata: {
          proofOfAddressDocumentId:
            this.userPolicy.normalizeOptionalString(
              upsertKycAddressDto.proofOfAddressDocumentId,
            ) ?? null,
          proofOfAddressDocumentUrl:
            this.userPolicy.normalizeOptionalString(
              upsertKycAddressDto.proofOfAddressDocumentUrl,
            ) ?? null,
          isAtAddress: upsertKycAddressDto.isAtAddress ?? null,
        },
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
        this.userPolicy.normalizeOptionalString(
          upsertKycLivenessDto.selfieDocumentId,
        ) ??
        userKyc.livenessData?.providerReference ??
        null,
      outcome:
        this.userPolicy.normalizeOptionalString(upsertKycLivenessDto.outcome) ??
        userKyc.livenessData?.outcome ??
        null,
      completed:
        upsertKycLivenessDto.completed ??
        (Boolean(
          this.userPolicy.normalizeOptionalString(
            upsertKycLivenessDto.selfieDocumentId,
          ) ||
            this.userPolicy.normalizeOptionalString(
              upsertKycLivenessDto.selfieDocumentUrl,
            ),
        ) ||
          (userKyc.livenessData?.completed ?? false)),
      metadata:
        {
          ...(userKyc.livenessData?.metadata ?? {}),
          ...(upsertKycLivenessDto.metadata ?? {}),
          selfieDocumentId:
            this.userPolicy.normalizeOptionalString(
              upsertKycLivenessDto.selfieDocumentId,
            ) ?? null,
          selfieDocumentUrl:
            this.userPolicy.normalizeOptionalString(
              upsertKycLivenessDto.selfieDocumentUrl,
            ) ?? null,
        },
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

    const { stage, documentType, category } =
      this.resolveDocumentStageAndType(uploadKycDocumentsDto);
    const createdDocuments: KycDocument[] = [];

    for (const file of files ?? []) {
      createdDocuments.push(
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
        metadata: {
          ...(metadata ?? {}),
          category,
        },
      }),
      );
    }

    for (const fileUrl of fileUrls) {
      createdDocuments.push(
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
        metadata: {
          ...(metadata ?? {}),
          category,
        },
      }),
      );
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

    const kycResponse = await this.getKyc(userId);
    const latestDocument = createdDocuments.length
      ? this.serializeKycDocuments([
          createdDocuments[createdDocuments.length - 1],
        ])[0]
      : null;

    return {
      ...kycResponse,
      document: latestDocument,
      file: latestDocument,
    };
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
      await this.syncWalletRouting(userId, user, capabilities);
      throw new PreconditionFailedException(
        capabilities.blockedReason ?? API_MESSAGES.TRANSFER_BLOCKED_PENDING_KYC,
      );
    }

    await this.syncWalletRouting(userId, user, capabilities);
    return capabilities;
  }

  private async getSyncedContext(userId: string) {
    let user = await this.loadUserContext(userId);
    let capabilities = this.userPolicy.computeCapabilities(user);
    await this.syncWalletRouting(userId, user, capabilities);
    user = await this.loadUserContext(userId);
    capabilities = this.userPolicy.computeCapabilities(user);

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
    const documents = userKyc?.documents ?? user.kycDocuments ?? [];
    const rejectionReason = this.getKycRejectionReason(user, userKyc);
    const governmentIdComplete = this.isGovernmentIdSectionComplete(
      capabilities.region,
      userKyc,
      documents,
    );
    const addressComplete = this.isAddressSectionComplete(address, documents);
    const livenessComplete = this.isLivenessSectionComplete(userKyc, documents);
    const status = this.userPolicy.mapKycStatusToClientStatus({
      status: userKyc?.status ?? user.kycStatus,
      regionState: regionResolution.state,
      governmentIdComplete,
      addressComplete,
      livenessComplete,
    });
    const sections = this.userPolicy.buildKycSectionProgress({
      region: capabilities.region,
      globalStatus: status,
      rejectionReason,
      governmentIdComplete,
      addressComplete,
      livenessComplete,
    });

    return {
      region: capabilities.region,
      provider: capabilities.provider ?? userKyc?.provider ?? user.kycProvider,
      status,
      rawStatus: userKyc?.status ?? user.kycStatus,
      isSupportedRegion: regionResolution.state === 'RESOLVED',
      regionState: regionResolution.state,
      blockedReason:
        capabilities.blockedReason ??
        userKyc?.blockedReason ??
        this.userPolicy.mapKycStatusToBlockedReason(
          userKyc?.status ?? user.kycStatus,
        ),
      rejectionReason,
      submittedAt: userKyc?.submittedAt ?? user.kycSubmittedAt,
      reviewedAt: userKyc?.reviewedAt ?? user.kycReviewedAt,
      requirements: this.userPolicy.buildKycRequirements(capabilities.region),
      sections,
      identity: this.buildMobileKycIdentity(userKyc, address),
      address: {
        ...address,
        state: address.stateOrRegion,
      },
      liveness: userKyc?.livenessData ?? null,
      documents: this.serializeKycDocuments(documents),
      uploads: this.serializeKycUploads(documents),
      capabilities,
      productAvailability: capabilities.productAvailability,
      limits: capabilities.limits,
      profile: this.serializeProfile(user),
    };
  }

  private serializeProfile(
    user: User,
    capabilities?: UserCapabilities,
    walletRails?: WalletRailDetails[],
    accountRails?: {
      primary: WalletRailDetails | null;
      byCurrency: Partial<Record<Currency, WalletRailDetails>>;
    },
    fundingMethods?: FundingMethodAvailability[],
  ) {
    const effectiveCapabilities =
      capabilities ?? this.userPolicy.computeCapabilities(user);
    const effectiveWalletRails =
      walletRails ?? this.buildWalletRailDetails(user, effectiveCapabilities);
    const effectiveAccountRails =
      accountRails ?? this.buildAccountRailSummary(effectiveWalletRails);
    const effectiveFundingMethods =
      fundingMethods ??
      this.buildFundingMethods(effectiveCapabilities, effectiveWalletRails);
    const normalizedKycStatus = this.userPolicy.mapKycStatusToClientStatus({
      status: user.kyc?.status ?? user.kycStatus,
      regionState: this.userPolicy.resolveRegionForUser(user, user.kyc).state,
      governmentIdComplete: this.isGovernmentIdSectionComplete(
        effectiveCapabilities.region,
        user.kyc,
        user.kyc?.documents ?? user.kycDocuments ?? [],
      ),
      addressComplete: this.isAddressSectionComplete(
        this.userPolicy.buildAddressSnapshotFromSources(
          user.kyc?.addressData ?? undefined,
          this.getUserAddressSnapshot(user),
        ),
        user.kyc?.documents ?? user.kycDocuments ?? [],
      ),
      livenessComplete: this.isLivenessSectionComplete(
        user.kyc,
        user.kyc?.documents ?? user.kycDocuments ?? [],
      ),
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      referralCode: user.referralCode,
      phoneNumber: user.phoneNumber,
      dateOfBirth: user.dateOfBirth,
      profilePicture: user.profilePicture,
      tagId: user.tagId,
      role: user.role,
      accountStatus: user.accountStatus,
      authType: user.authType,
      reasonForDeactivation: user.reasonForDeactivation,
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
      region: effectiveCapabilities.region,
      provider: effectiveCapabilities.provider,
      kycStatus: normalizedKycStatus,
      rawKycStatus: user.kyc?.status ?? user.kycStatus,
      kycProvider: effectiveCapabilities.provider ?? user.kyc?.provider ?? user.kycProvider,
      kycSubmittedAt: user.kyc?.submittedAt ?? user.kycSubmittedAt,
      kycReviewedAt: user.kyc?.reviewedAt ?? user.kycReviewedAt,
      security: {
        hasTransactionPin: effectiveCapabilities.hasTransactionPin,
        requiresTransactionPinSetup: !effectiveCapabilities.hasTransactionPin,
        canUsePinProtectedTransfers: effectiveCapabilities.canTransfer,
        canUseInternalTransfers: effectiveCapabilities.canInternalTransfer,
        canUseExternalTransfers: effectiveCapabilities.canExternalTransfer,
        canReceiveExternal: effectiveCapabilities.canExternalReceive,
        biometricManagedByDevice: true,
      },
      wallet: effectiveWalletRails,
      wallets: effectiveWalletRails,
      capabilities: effectiveCapabilities,
      productAvailability: effectiveCapabilities.productAvailability,
      limits: effectiveCapabilities.limits,
      accountRails: effectiveAccountRails,
      fundingMethods: effectiveFundingMethods,
    };
  }

  private buildFundingMethods(
    capabilities: UserCapabilities,
    walletRails: WalletRailDetails[],
  ): FundingMethodAvailability[] {
    const hasBankTransferRail = walletRails.some(
      (wallet) => wallet.externalReceiveEnabled,
    );
    const bankTransferBlockedReason =
      walletRails.find((wallet) => wallet.blockedReason)?.blockedReason ??
      (capabilities.region === SupportedRegion.NG
        ? 'Bank transfer rails are still being provisioned for this account.'
        : capabilities.region
          ? API_MESSAGES.EXTERNAL_TRANSFER_UNAVAILABLE
          : null);

    return [
      {
        code: 'BANK_TRANSFER',
        title: 'Bank transfer',
        description: 'Fund your wallet through your assigned receive rails.',
        enabled: hasBankTransferRail,
        provider: capabilities.provider,
        blockedReason:
          hasBankTransferRail
            ? null
            : capabilities.region
              ? bankTransferBlockedReason
              : API_MESSAGES.KYC_REGION_REQUIRED,
        currencies: walletRails
          .filter((wallet) => wallet.externalReceiveEnabled)
          .map((wallet) => wallet.currency),
        action: {
          type: 'INFO',
          path: null,
          method: null,
        },
      },
      {
        code: 'CARD_TOP_UP',
        title: 'Card top-up',
        description: 'Fund your wallet instantly with a debit or credit card.',
        enabled: capabilities.productAvailability.cardTopUp,
        provider: capabilities.provider,
        blockedReason: capabilities.productAvailability.cardTopUp
          ? null
          : capabilities.region
            ? API_MESSAGES.CARD_TOPUP_UNAVAILABLE
            : API_MESSAGES.KYC_REGION_REQUIRED,
        currencies: capabilities.productAvailability.cardTopUp
          ? [Currency.NGN]
          : [],
        action: capabilities.productAvailability.cardTopUp
          ? {
              type: 'API',
              path: '/wallet/top-up/card',
              method: 'POST',
            }
          : {
              type: 'INFO',
              path: null,
              method: null,
            },
      },
    ];
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

  private generateSixDigitToken() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private async syncWalletRouting(
    userId: string,
    user: User,
    capabilities: UserCapabilities,
  ) {
    await this.walletRepository.syncRoutingForUser(userId, {
      receiveEnabled: capabilities.canReceive,
      transferEnabled: capabilities.canTransfer,
      routingRegionCode: capabilities.region,
      routingProvider: capabilities.provider,
    });

    if (capabilities.region) {
      await this.providerOperationsService.ensureReceiveRailsForUser(
        user,
        capabilities.region,
      );
    }
  }

  private buildWalletRailDetails(
    user: User,
    capabilities: UserCapabilities,
  ): WalletRailDetails[] {
    return (user.wallet ?? []).map((wallet) => {
      const region =
        (wallet.routingRegionCode as SupportedRegion | null) ??
        capabilities.region ??
        null;
      const provider = wallet.routingProvider ?? capabilities.provider ?? null;
      const railType =
        region === SupportedRegion.US &&
        provider === KycProvider.LEAD_BANK
          ? 'INTERNAL_ONLY'
          : wallet.accountNumber && wallet.routingNumber
          ? 'ACH'
          : wallet.accountNumber
            ? 'VIRTUAL_ACCOUNT'
            : 'INTERNAL_ONLY';
      const providerMetadata = wallet.providerMetadata ?? null;
      const supportsExternalRails =
        (region === SupportedRegion.NG && wallet.currency === Currency.NGN) ||
        (region === SupportedRegion.US && wallet.currency === Currency.USD);
      const leadBankUnavailable =
        region === SupportedRegion.US && provider === KycProvider.LEAD_BANK;
      const externalReceiveEnabled = Boolean(
        supportsExternalRails &&
          wallet.accountNumber &&
          wallet.receiveEnabled &&
          !providerMetadata?.staging &&
          !leadBankUnavailable,
      );
      const externalTransferEnabled = Boolean(
        supportsExternalRails &&
          capabilities.canExternalTransfer &&
          !leadBankUnavailable,
      );
      const provisioningStatus =
        externalReceiveEnabled
          ? 'READY'
          : providerMetadata?.provisioningDeferred
            ? 'DEFERRED'
            : leadBankUnavailable
              ? 'UNAVAILABLE'
              : supportsExternalRails
                ? 'PENDING'
                : 'UNAVAILABLE';
      const blockedReason =
        externalReceiveEnabled || externalTransferEnabled
          ? null
          : providerMetadata?.provisioningError ??
            (leadBankUnavailable
              ? 'Lead Bank receive rails are not connected yet in staging.'
              : capabilities.region
                ? capabilities.blockedReason
                : API_MESSAGES.KYC_REGION_REQUIRED);
      const supportedOperations: Array<'RECEIVE' | 'TRANSFER' | 'TOP_UP'> = [];

      if (externalReceiveEnabled) {
        supportedOperations.push('RECEIVE');
      }

      if (externalTransferEnabled) {
        supportedOperations.push('TRANSFER');
      }

      if (
        region === SupportedRegion.NG &&
        wallet.currency === Currency.NGN &&
        capabilities.productAvailability.cardTopUp
      ) {
        supportedOperations.push('TOP_UP');
      }

      return {
        walletId: wallet.id,
        currency: wallet.currency,
        provider,
        region,
        railType,
        balance: wallet.balance,
        accountNumber: leadBankUnavailable ? null : wallet.accountNumber,
        routingNumber: leadBankUnavailable ? null : wallet.routingNumber,
        accountName: leadBankUnavailable ? null : wallet.accountName,
        bankName: leadBankUnavailable ? null : wallet.bankName,
        sortCode: leadBankUnavailable ? null : wallet.sortCode,
        receiveEnabled: wallet.receiveEnabled,
        transferEnabled: wallet.transferEnabled,
        externalReceiveEnabled,
        externalTransferEnabled,
        providerCustomerId: wallet.providerCustomerId,
        providerAccountId: wallet.providerAccountId,
        providerVirtualAccountId: wallet.providerVirtualAccountId,
        providerReference: wallet.providerReference,
        providerMetadata,
        provisioningStatus,
        blockedReason,
        supportedOperations,
      };
    });
  }

  private buildAccountRailSummary(walletRails: WalletRailDetails[]) {
    const primary =
      walletRails.find((wallet) => wallet.externalReceiveEnabled) ??
      walletRails.find((wallet) => wallet.accountNumber) ??
      null;
    const byCurrency: Partial<Record<Currency, WalletRailDetails>> = {};

    for (const wallet of walletRails) {
      byCurrency[wallet.currency] = wallet;
    }

    return {
      primary,
      byCurrency,
      provisioningState: primary?.provisioningStatus ?? 'UNAVAILABLE',
      blockedReason: primary?.blockedReason ?? null,
    };
  }

  private buildPendingActions(
    user: User,
    capabilities: UserCapabilities,
    walletRails: WalletRailDetails[],
  ) {
    const pendingActions: Array<{
      code: string;
      title: string;
      description: string;
      blocking: boolean;
    }> = [];

    if (!user.isVerified) {
      pendingActions.push({
        code: 'VERIFY_EMAIL',
        title: 'Verify your email',
        description: 'Email verification is required before login can complete normally.',
        blocking: true,
      });
    }

    if (!capabilities.hasTransactionPin) {
      pendingActions.push({
        code: 'SET_TRANSACTION_PIN',
        title: 'Set transaction PIN',
        description: API_MESSAGES.TRANSFER_PIN_REQUIRED,
        blocking: true,
      });
    }

    if (!capabilities.canTransfer && capabilities.blockedReason) {
      pendingActions.push({
        code: 'COMPLETE_KYC',
        title: 'Complete account verification',
        description: capabilities.blockedReason,
        blocking: true,
      });
    }

    const railPending = walletRails.find(
      (wallet) =>
        wallet.region === SupportedRegion.NG &&
        wallet.currency === Currency.NGN &&
        wallet.provisioningStatus !== 'READY',
    );

    if (railPending?.blockedReason) {
      pendingActions.push({
        code: 'WAIT_FOR_BANK_RAIL',
        title: 'Bank transfer rails pending',
        description: railPending.blockedReason,
        blocking: false,
      });
    }

    return pendingActions;
  }

  private buildMarketSummary(region: SupportedRegion | null) {
    if (region === SupportedRegion.NG) {
      return {
        enabled: true,
        source: 'CURATED_STAGING',
        message: 'Reference market summary for staging home content.',
        pairs: [
          { pair: 'USD/NGN', rate: 1520, direction: 'NEUTRAL' },
          { pair: 'GBP/NGN', rate: 1940, direction: 'NEUTRAL' },
        ],
      };
    }

    if (region === SupportedRegion.US) {
      return {
        enabled: true,
        source: 'CURATED_STAGING',
        message: 'Reference market summary for staging home content.',
        pairs: [
          { pair: 'USD/NGN', rate: 1520, direction: 'NEUTRAL' },
          { pair: 'USD/GBP', rate: 0.78, direction: 'NEUTRAL' },
        ],
      };
    }

    return {
      enabled: false,
      source: 'UNAVAILABLE',
      message: API_MESSAGES.KYC_REGION_REQUIRED,
      pairs: [],
    };
  }

  private buildHomePromotions(user: any) {
    return [
      {
        code: 'REFER_AND_EARN',
        title: 'Invite friends to VidalPay',
        description: 'Share your referral code and complete more funded accounts.',
        cta: 'Share referral code',
        value: user.referralCode ?? null,
      },
    ];
  }

  private buildMobileKycIdentity(
    userKyc: UserKyc | null | undefined,
    address: KycAddressSnapshot,
  ) {
    return {
      nin: userKyc?.identityData?.nin ?? null,
      bvn: userKyc?.identityData?.bvn ?? null,
      ssn: userKyc?.identityData?.ssn ?? null,
      approvedIdentityType: userKyc?.identityData?.approvedIdentityType ?? null,
      approvedIdentityValue: userKyc?.identityData?.approvedIdentityValue ?? null,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2,
      city: address.city,
      state: address.stateOrRegion,
      stateOrRegion: address.stateOrRegion,
      postalCode: address.postalCode,
      country: address.country,
      countryCode: address.countryCode,
      isAtAddress: Boolean(address.addressLine1),
      metadata: userKyc?.identityData?.metadata ?? null,
    };
  }

  private serializeKycDocuments(documents: Array<any>) {
    return documents.map((document) => ({
      id: document.id,
      stage: document.stage,
      category: this.getDocumentCategory(document),
      documentType: document.documentType,
      originalFileName: document.originalFileName,
      storedFileName: document.storedFileName,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      storage: document.storage,
      fileUrl: document.fileUrl,
      uploadedViaBackend: document.uploadedViaBackend,
      metadata: document.metadata,
      createdAt:
        typeof document.createdAt?.toISOString === 'function'
          ? document.createdAt.toISOString()
          : document.createdAt,
    }));
  }

  private serializeKycUploads(documents: Array<any>) {
    return documents
      .map((document) => {
        const category = this.getDocumentCategory(document);
        if (!category) {
          return null;
        }

        return {
          id: document.id,
          category,
          uri: document.fileUrl,
          remoteUrl: document.fileUrl,
          fileName:
            document.originalFileName ??
            document.storedFileName ??
            `${category.toLowerCase()}.jpg`,
          mimeType: document.mimeType ?? 'application/octet-stream',
          createdAt:
            typeof document.createdAt?.toISOString === 'function'
              ? document.createdAt.toISOString()
              : document.createdAt,
        };
      })
      .filter((document): document is NonNullable<typeof document> => Boolean(document));
  }

  private getDocumentCategory(document: any) {
    const explicitCategory = this.userPolicy
      .normalizeOptionalString(document?.metadata?.category)
      ?.toUpperCase();
    if (explicitCategory) {
      return explicitCategory;
    }

    if (document.stage === KycDocumentStage.IDENTITY) {
      return 'GOVERNMENT_ID_IMAGE';
    }

    if (document.stage === KycDocumentStage.ADDRESS) {
      return 'PROOF_OF_ADDRESS_IMAGE';
    }

    if (document.stage === KycDocumentStage.LIVENESS) {
      return 'SELFIE_IMAGE';
    }

    return null;
  }

  private isGovernmentIdSectionComplete(
    region: SupportedRegion | null,
    userKyc: UserKyc | null | undefined,
    documents: Array<any>,
  ) {
    const hasIdentityDocument = documents.some(
      (document) =>
        document.stage === KycDocumentStage.IDENTITY ||
        this.getDocumentCategory(document) === 'GOVERNMENT_ID_IMAGE',
    );

    if (region === SupportedRegion.NG) {
      return Boolean(userKyc?.identityData?.nin && userKyc?.identityData?.bvn) &&
        hasIdentityDocument;
    }

    if (region === SupportedRegion.US) {
      return Boolean(
        userKyc?.identityData?.ssn ||
          (userKyc?.identityData?.approvedIdentityType &&
            userKyc?.identityData?.approvedIdentityValue),
      ) && hasIdentityDocument;
    }

    return false;
  }

  private isAddressSectionComplete(
    address: KycAddressSnapshot,
    documents: Array<any>,
  ) {
    const hasAddressDocument = documents.some(
      (document) =>
        document.stage === KycDocumentStage.ADDRESS ||
        this.getDocumentCategory(document) === 'PROOF_OF_ADDRESS_IMAGE',
    );

    return Boolean(
      address.addressLine1 &&
        address.city &&
        address.stateOrRegion &&
        address.country &&
        address.countryCode &&
        hasAddressDocument,
    );
  }

  private isLivenessSectionComplete(
    userKyc: UserKyc | null | undefined,
    documents: Array<any>,
  ) {
    const hasLivenessDocument = documents.some(
      (document) =>
        document.stage === KycDocumentStage.LIVENESS ||
        this.getDocumentCategory(document) === 'SELFIE_IMAGE',
    );

    return Boolean(userKyc?.livenessData?.completed || hasLivenessDocument);
  }

  private getKycRejectionReason(user: User, userKyc?: UserKyc | null) {
    const providerResponse = userKyc?.providerResponse ?? {};
    const rejectionReason =
      this.userPolicy.normalizeOptionalString(providerResponse?.rejectionReason) ??
      this.userPolicy.normalizeOptionalString(providerResponse?.reason) ??
      null;

    if (rejectionReason) {
      return rejectionReason;
    }

    const rawStatus = userKyc?.status ?? user.kycStatus;
    if (rawStatus === KycStatus.REJECTED) {
      return userKyc?.blockedReason ?? API_MESSAGES.KYC_REJECTED;
    }

    return null;
  }

  private resolveDocumentStageAndType(uploadKycDocumentsDto: UploadKycDocumentsDto) {
    const category = this.userPolicy
      .normalizeOptionalString(uploadKycDocumentsDto.category)
      ?.toUpperCase();

    if (category === 'GOVERNMENT_ID_IMAGE') {
      return {
        stage: KycDocumentStage.IDENTITY,
        documentType:
          this.userPolicy.normalizeOptionalString(
            uploadKycDocumentsDto.documentType,
          ) ?? 'GOVERNMENT_ID',
        category,
      };
    }

    if (category === 'PROOF_OF_ADDRESS_IMAGE') {
      return {
        stage: KycDocumentStage.ADDRESS,
        documentType:
          this.userPolicy.normalizeOptionalString(
            uploadKycDocumentsDto.documentType,
          ) ?? 'PROOF_OF_ADDRESS',
        category,
      };
    }

    if (category === 'SELFIE_IMAGE') {
      return {
        stage: KycDocumentStage.LIVENESS,
        documentType:
          this.userPolicy.normalizeOptionalString(
            uploadKycDocumentsDto.documentType,
          ) ?? 'SELFIE',
        category,
      };
    }

    return {
      stage: uploadKycDocumentsDto.stage ?? KycDocumentStage.SUPPORTING,
      documentType:
        this.userPolicy.normalizeOptionalString(
          uploadKycDocumentsDto.documentType,
        ) ?? null,
      category: category ?? 'SUPPORTING_DOCUMENT',
    };
  }
}
