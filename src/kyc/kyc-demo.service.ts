import { Injectable } from '@nestjs/common';
import { KycStatus } from 'src/common/enum/kyc-status.enum';
import { SupportedRegion } from 'src/common/enum/supported-region.enum';
import { UserKycRepository } from 'src/database/repositories/user-kyc.repository';
import { UserRepository } from 'src/database/repositories/user.repository';
import { FeatureFlagService } from 'src/feature-flags/feature-flag.service';
import { KycProviderRouterService } from 'src/integrations/kyc/kyc-provider-router.service';
import { NotificationService } from 'src/notifications/notification.service';
import {
  DemoKycStatus,
  DemoKycSubmitDto,
} from './dto/demo-kyc-submit.dto';

@Injectable()
export class KycDemoService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly userKycRepository: UserKycRepository,
    private readonly kycProviderRouter: KycProviderRouterService,
    private readonly featureFlags: FeatureFlagService,
    private readonly notificationService: NotificationService,
  ) {}

  async submit(userId: string, dto: DemoKycSubmitDto) {
    this.featureFlags.assertEnabled('ENABLE_DEMO_MODE');
    const user = await this.userRepository.getUserProfileContext(userId);
    const userKyc = await this.userKycRepository.getOrCreateForUser(user);
    const demoStatus = dto.status ?? DemoKycStatus.UNDER_REVIEW;
    const internalStatus = this.toInternalStatus(demoStatus);
    const countryCode =
      dto.countryCode?.toUpperCase() ??
      userKyc.countryCode ??
      user.countryCode ??
      SupportedRegion.NG;
    const region =
      countryCode === SupportedRegion.US ? SupportedRegion.US : SupportedRegion.NG;
    const provider = this.kycProviderRouter.mapRegionToProvider(region);
    const now = new Date();
    const reviewedAt =
      internalStatus === KycStatus.VERIFIED || internalStatus === KycStatus.REJECTED
        ? now
        : null;

    await this.userKycRepository.findOneAndUpdate(userKyc.id, {
      status: internalStatus,
      provider,
      countryCode: region,
      country: region === SupportedRegion.NG ? 'Nigeria' : 'United States',
      submittedAt:
        internalStatus === KycStatus.NOT_STARTED ? null : userKyc.submittedAt ?? now,
      reviewedAt,
      blockedReason: this.getBlockedReason(internalStatus),
      submissionReference: `demo_kyc_${userId}_${Date.now()}`,
      providerResponse: {
        demo: true,
        requestedStatus: demoStatus,
        note: dto.note ?? null,
      },
    });

    await this.userRepository.findOneAndUpdate(userId, {
      countryCode: region,
      country: region === SupportedRegion.NG ? 'Nigeria' : 'United States',
      kycStatus: internalStatus,
      kycProvider: provider,
      kycSubmittedAt:
        internalStatus === KycStatus.NOT_STARTED ? null : user.kycSubmittedAt ?? now,
      kycReviewedAt: reviewedAt,
    });

    await this.notificationService.create({
      userId,
      type: 'KYC_DEMO_UPDATED',
      title: 'KYC status updated',
      body: `Demo KYC status is now ${demoStatus}.`,
      metadata: {
        status: demoStatus,
        internalStatus,
      },
    });

    return this.getStatus(userId);
  }

  async getStatus(userId: string) {
    const user = await this.userRepository.getUserProfileContext(userId);
    const userKyc = await this.userKycRepository.getOrCreateForUser(user);
    const internalStatus = userKyc.status ?? user.kycStatus;

    return {
      status: this.toDemoStatus(internalStatus),
      rawStatus: internalStatus,
      provider: userKyc.provider ?? user.kycProvider,
      submittedAt: userKyc.submittedAt ?? user.kycSubmittedAt,
      reviewedAt: userKyc.reviewedAt ?? user.kycReviewedAt,
      blockedReason: userKyc.blockedReason,
      submissionReference: userKyc.submissionReference,
      providerResponse: userKyc.providerResponse,
    };
  }

  private toInternalStatus(status: DemoKycStatus): KycStatus {
    switch (status) {
      case DemoKycStatus.NOT_STARTED:
        return KycStatus.NOT_STARTED;
      case DemoKycStatus.APPROVED:
        return KycStatus.VERIFIED;
      case DemoKycStatus.REJECTED:
        return KycStatus.REJECTED;
      case DemoKycStatus.RESUBMISSION_REQUIRED:
        return KycStatus.REQUIRES_ACTION;
      case DemoKycStatus.PENDING:
      case DemoKycStatus.UNDER_REVIEW:
      default:
        return KycStatus.PENDING_REVIEW;
    }
  }

  private toDemoStatus(status: KycStatus): DemoKycStatus {
    switch (status) {
      case KycStatus.NOT_STARTED:
      case KycStatus.DRAFT:
        return DemoKycStatus.NOT_STARTED;
      case KycStatus.VERIFIED:
        return DemoKycStatus.APPROVED;
      case KycStatus.REJECTED:
        return DemoKycStatus.REJECTED;
      case KycStatus.REQUIRES_ACTION:
        return DemoKycStatus.RESUBMISSION_REQUIRED;
      case KycStatus.PENDING_REVIEW:
      default:
        return DemoKycStatus.UNDER_REVIEW;
    }
  }

  private getBlockedReason(status: KycStatus) {
    if (status === KycStatus.VERIFIED) {
      return null;
    }

    if (status === KycStatus.REJECTED) {
      return 'Demo KYC was rejected.';
    }

    if (status === KycStatus.REQUIRES_ACTION) {
      return 'Demo KYC requires resubmission.';
    }

    if (status === KycStatus.PENDING_REVIEW) {
      return 'Demo KYC is under review.';
    }

    return 'KYC has not been started.';
  }
}
