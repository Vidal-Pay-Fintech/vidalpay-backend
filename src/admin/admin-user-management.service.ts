import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, DataSource, IsNull } from 'typeorm';
import { KycStatus } from 'src/common/enum/kyc-status.enum';
import { AdminUserAction } from 'src/database/entities/admin-user-action.entity';
import { AccountStatus, User } from 'src/database/entities/user.entity';
import { UserKyc } from 'src/database/entities/user-kyc.entity';
import { RefreshSession } from 'src/database/entities/refresh-session.entity';
import { UserRole } from 'src/utils/enums/user.enum';
import { AdminUserActionType } from './admin-user-management.enums';
import {
  AdminKycDecisionDto,
  AdminRoleChangeDto,
  AdminUserListQueryDto,
} from './dto/admin-user-management.dto';

export interface AdminActionContext {
  actorId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AdminUserManagementService {
  constructor(private readonly dataSource: DataSource) {}

  async listUsers(query: AdminUserListQueryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 50;
    const builder = this.dataSource
      .getRepository(User)
      .createQueryBuilder('user')
      .where('user.deletedAt IS NULL');
    if (query.search?.trim()) {
      builder.andWhere(
        new Brackets((where) => {
          where
            .where('user.email LIKE :search', {
              search: `%${query.search?.trim()}%`,
            })
            .orWhere('user.phoneNumber LIKE :search', {
              search: `%${query.search?.trim()}%`,
            })
            .orWhere('user.tagId LIKE :search', {
              search: `%${query.search?.trim()}%`,
            })
            .orWhere('user.id = :exactSearch', {
              exactSearch: query.search?.trim(),
            });
        }),
      );
    }
    if (query.status)
      builder.andWhere('user.status = :status', { status: query.status });
    if (query.role) builder.andWhere('user.role = :role', { role: query.role });
    if (query.kycStatus) {
      builder.andWhere('user.kycStatus = :kycStatus', {
        kycStatus: query.kycStatus,
      });
    }
    const [users, total] = await builder
      .orderBy('user.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return {
      items: users.map((user) => this.safeUserSummary(user)),
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  listKycQueue(query: AdminUserListQueryDto) {
    return this.listUsers({
      ...query,
      kycStatus: query.kycStatus ?? KycStatus.PENDING_REVIEW,
    });
  }

  async getUser(userId: string) {
    const user = await this.dataSource.getRepository(User).findOne({
      where: { id: userId },
      relations: ['wallet', 'kyc', 'kyc.documents', 'kycDocuments'],
    });
    if (!user) throw new NotFoundException('User not found.');
    const actions = await this.dataSource
      .getRepository(AdminUserAction)
      .createQueryBuilder('action')
      .addSelect(['action.previousState', 'action.newState'])
      .where('action.targetUserId = :userId', { userId })
      .orderBy('action.createdAt', 'DESC')
      .take(100)
      .getMany();
    return {
      user: this.safeUserSummary(user),
      wallets: (user.wallet ?? []).map((wallet) => ({
        id: wallet.id,
        currency: wallet.currency,
        isDefault: wallet.isDefault,
        transferEnabled: wallet.transferEnabled,
      })),
      kyc: this.safeKyc(user.kyc),
      documents: this.safeDocuments([
        ...(user.kyc?.documents ?? []),
        ...(user.kycDocuments ?? []),
      ]),
      actions,
    };
  }

  suspend(userId: string, reason: string, context: AdminActionContext) {
    return this.changeAccountStatus(
      userId,
      AccountStatus.SUSPENDED,
      reason,
      AdminUserActionType.SUSPEND,
      context,
    );
  }

  reactivate(userId: string, reason: string, context: AdminActionContext) {
    return this.changeAccountStatus(
      userId,
      AccountStatus.ACTIVE,
      reason,
      AdminUserActionType.REACTIVATE,
      context,
    );
  }

  async changeRole(
    userId: string,
    dto: AdminRoleChangeDto,
    context: AdminActionContext,
  ) {
    const result = await this.dataSource.transaction(async (manager) => {
      const actor = await this.requireUser(context.actorId, manager);
      const target = await this.requireUser(userId, manager);
      if (actor.role !== UserRole.SUPER_ADMIN) {
        throw new ForbiddenException(
          'Only a super administrator can change roles.',
        );
      }
      if (actor.id === target.id) {
        throw new ConflictException('You cannot change your own role.');
      }
      if (target.role === dto.role) return { user: target, changed: false };
      const previousRole = target.role;
      target.role = dto.role;
      const saved = await manager.getRepository(User).save(target);
      await this.recordAction(manager, context, target.id, {
        action: AdminUserActionType.ROLE_CHANGE,
        reason: dto.reason,
        previousState: { role: previousRole },
        newState: { role: dto.role },
      });
      await manager
        .getRepository(RefreshSession)
        .update(
          { userId: target.id, revokedAt: IsNull() },
          { revokedAt: new Date() },
        );
      return { user: saved, changed: true };
    });
    return this.safeUserSummary(result.user);
  }

  async reviewKyc(
    userId: string,
    dto: AdminKycDecisionDto,
    context: AdminActionContext,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const actor = await this.requireUser(context.actorId, manager);
      this.assertReviewRole(actor);
      if (
        actor.role === UserRole.CUSTOMER_SUPPORT &&
        dto.status !== KycStatus.REQUIRES_ACTION
      ) {
        throw new ForbiddenException(
          'Customer support can request additional information but cannot finalize KYC.',
        );
      }
      const user = await this.requireUser(userId, manager);
      const kyc = await manager.getRepository(UserKyc).findOne({
        where: { userId },
        relations: ['documents'],
      });
      if (!kyc) throw new NotFoundException('KYC record not found.');
      if (
        ![KycStatus.PENDING_REVIEW, KycStatus.REQUIRES_ACTION].includes(
          kyc.status,
        )
      ) {
        throw new ConflictException('This KYC record is not awaiting review.');
      }
      if (dto.status === KycStatus.VERIFIED) this.assertKycComplete(kyc);
      const previousStatus = kyc.status;
      const reviewedAt = new Date();
      kyc.status = dto.status;
      kyc.reviewedAt = reviewedAt;
      kyc.blockedReason = dto.status === KycStatus.VERIFIED ? null : dto.reason;
      kyc.providerResponse = {
        ...(kyc.providerResponse ?? {}),
        manualReview: {
          actorId: actor.id,
          status: dto.status,
          reason: dto.reason,
          reviewedAt: reviewedAt.toISOString(),
        },
      };
      await manager.getRepository(UserKyc).save(kyc);
      user.kycStatus = dto.status;
      user.kycReviewedAt = reviewedAt;
      await manager.getRepository(User).save(user);
      const action =
        dto.status === KycStatus.VERIFIED
          ? AdminUserActionType.KYC_APPROVE
          : dto.status === KycStatus.REJECTED
            ? AdminUserActionType.KYC_REJECT
            : AdminUserActionType.KYC_REQUIRE_ACTION;
      await this.recordAction(manager, context, user.id, {
        action,
        reason: dto.reason,
        previousState: { kycStatus: previousStatus },
        newState: { kycStatus: dto.status },
      });
      return {
        user: this.safeUserSummary(user),
        kyc: this.safeKyc(kyc),
        documents: this.safeDocuments(kyc.documents ?? []),
      };
    });
  }

  private async changeAccountStatus(
    userId: string,
    status: AccountStatus,
    reason: string,
    action: AdminUserActionType,
    context: AdminActionContext,
  ) {
    const updated = await this.dataSource.transaction(async (manager) => {
      const actor = await this.requireUser(context.actorId, manager);
      const target = await this.requireUser(userId, manager);
      this.assertCanManageAccount(actor, target);
      if (
        status === AccountStatus.ACTIVE &&
        target.status !== AccountStatus.SUSPENDED
      ) {
        throw new ConflictException(
          'Only a suspended account can be reactivated.',
        );
      }
      if (
        status === AccountStatus.SUSPENDED &&
        target.status === AccountStatus.DEACTIVATED
      ) {
        throw new ConflictException(
          'A deactivated account cannot be suspended.',
        );
      }
      if (target.status === status) return target;
      const previousStatus = target.status;
      target.status = status;
      target.reasonForDeactivation = reason;
      const saved = await manager.getRepository(User).save(target);
      await this.recordAction(manager, context, target.id, {
        action,
        reason,
        previousState: { status: previousStatus },
        newState: { status },
      });
      if (status === AccountStatus.SUSPENDED) {
        await manager
          .getRepository(RefreshSession)
          .update(
            { userId: target.id, revokedAt: IsNull() },
            { revokedAt: new Date() },
          );
      }
      return saved;
    });
    return this.safeUserSummary(updated);
  }

  private assertCanManageAccount(actor: User, target: User) {
    if (![UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(actor.role)) {
      throw new ForbiddenException('Administrator access is required.');
    }
    if (actor.id === target.id) {
      throw new ConflictException('You cannot change your own account status.');
    }
    if (
      target.role === UserRole.SUPER_ADMIN &&
      actor.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        'Only a super administrator can manage this account.',
      );
    }
  }

  private assertReviewRole(actor: User) {
    if (
      ![
        UserRole.ADMIN,
        UserRole.SUPER_ADMIN,
        UserRole.CUSTOMER_SUPPORT,
      ].includes(actor.role)
    ) {
      throw new ForbiddenException('KYC reviewer access is required.');
    }
  }

  private assertKycComplete(kyc: UserKyc) {
    const identity = kyc.identityData;
    const countryCode = (kyc.countryCode ?? '').toUpperCase();
    const identityComplete =
      countryCode === 'NG'
        ? Boolean(identity?.nin && identity?.bvn)
        : countryCode === 'US'
          ? Boolean(
              identity?.ssn ||
              (identity?.approvedIdentityType &&
                identity?.approvedIdentityValue),
            )
          : false;
    const address = kyc.addressData;
    const addressComplete = Boolean(
      address?.addressLine1 &&
      address.city &&
      address.stateOrRegion &&
      address.country &&
      address.countryCode,
    );
    if (!identityComplete || !addressComplete || !kyc.livenessData?.completed) {
      throw new BadRequestException(
        'KYC cannot be approved until identity, address and liveness checks are complete.',
      );
    }
  }

  private requireUser(userId: string, manager: any): Promise<User> {
    return manager
      .getRepository(User)
      .findOne({ where: { id: userId } })
      .then((user: User | null) => {
        if (!user) throw new NotFoundException('User not found.');
        return user;
      });
  }

  private recordAction(
    manager: any,
    context: AdminActionContext,
    targetUserId: string,
    input: Pick<
      AdminUserAction,
      'action' | 'reason' | 'previousState' | 'newState'
    >,
  ) {
    return manager.getRepository(AdminUserAction).save(
      manager.getRepository(AdminUserAction).create({
        actorId: context.actorId,
        targetUserId,
        ...input,
        ipAddress: context.ipAddress?.slice(0, 64) ?? null,
        userAgent: context.userAgent?.slice(0, 500) ?? null,
      }),
    );
  }

  private safeUserSummary(user: User) {
    return {
      id: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      firstName: user.firstName,
      lastName: user.lastName,
      tagId: user.tagId,
      role: user.role,
      status: user.status,
      isVerified: user.isVerified,
      isPhoneVerified: user.isPhoneVerified,
      kycStatus: user.kycStatus,
      kycProvider: user.kycProvider,
      signupRegion: user.signupRegion,
      defaultWalletCurrency: user.defaultWalletCurrency,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private safeKyc(kyc: UserKyc | null | undefined) {
    if (!kyc) return null;
    const identity = kyc.identityData;
    const mask = (value?: string | null) =>
      value ? `***${value.slice(-4)}` : null;
    return {
      id: kyc.id,
      status: kyc.status,
      provider: kyc.provider,
      country: kyc.country,
      countryCode: kyc.countryCode,
      identity: identity
        ? {
            nin: mask(identity.nin),
            bvn: mask(identity.bvn),
            ssn: mask(identity.ssn),
            approvedIdentityType: identity.approvedIdentityType ?? null,
            approvedIdentityValue: mask(identity.approvedIdentityValue),
          }
        : null,
      address: kyc.addressData,
      liveness: kyc.livenessData
        ? {
            completed: kyc.livenessData.completed ?? false,
            outcome: kyc.livenessData.outcome ?? null,
          }
        : null,
      submissionReference: kyc.submissionReference,
      blockedReason: kyc.blockedReason,
      submittedAt: kyc.submittedAt,
      reviewedAt: kyc.reviewedAt,
    };
  }

  private safeDocuments(documents: any[]) {
    const unique = new Map(
      documents.map((document) => [document.id, document]),
    );
    return [...unique.values()].map((document) => ({
      id: document.id,
      stage: document.stage,
      documentType: document.documentType,
      originalFileName: document.originalFileName,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      storage: document.storage,
      category: document.metadata?.category ?? null,
      uploadedAt: document.createdAt,
      contentAccess: 'SECURE_STORAGE_INTEGRATION_REQUIRED',
    }));
  }
}
