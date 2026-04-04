import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { AbstractRepository } from 'src/database/abstract.repository';
import { UserKyc } from '../entities/user-kyc.entity';
import { User } from '../entities/user.entity';
import { KycStatus } from 'src/common/enum/kyc-status.enum';

@Injectable()
export class UserKycRepository extends AbstractRepository<UserKyc> {
  protected readonly logger = new Logger(UserKycRepository.name);

  constructor(
    @InjectRepository(UserKyc)
    protected readonly userKycEntityRepository: Repository<UserKyc>,
  ) {
    super(userKycEntityRepository);
  }

  private getUserKycRepository(manager?: EntityManager): Repository<UserKyc> {
    return manager?.getRepository(UserKyc) ?? this.userKycEntityRepository;
  }

  async findByUserId(
    userId: string,
    manager?: EntityManager,
  ): Promise<UserKyc | null> {
    const repository = this.getUserKycRepository(manager);
    return repository.findOne({
      where: { userId, deletedAt: IsNull() as any },
      relations: ['user', 'documents'],
    });
  }

  async getOrCreateForUser(
    user: User,
    manager?: EntityManager,
  ): Promise<UserKyc> {
    const repository = this.getUserKycRepository(manager);
    const existing = await this.findByUserId(user.id, manager);
    if (existing) {
      return existing;
    }

    try {
      const createdKyc = repository.create({
        userId: user.id,
        user,
        status: user.kycStatus ?? KycStatus.NOT_STARTED,
        provider: user.kycProvider ?? null,
        country: user.country ?? null,
        countryCode: user.countryCode ?? null,
        submittedAt: user.kycSubmittedAt ?? null,
        reviewedAt: user.kycReviewedAt ?? null,
      });
      return await repository.save(createdKyc);
    } catch (error) {
      this.logger.error(
        `Failed to create KYC row for user ${user.id}: ${error.message}`,
        error.stack,
      );

      const retryExisting = await this.findByUserId(user.id, manager);
      if (retryExisting) {
        return retryExisting;
      }

      throw error;
    }
  }
}
