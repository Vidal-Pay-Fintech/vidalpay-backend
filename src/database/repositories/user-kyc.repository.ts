import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  async findByUserId(userId: string): Promise<UserKyc | null> {
    return this.findOne({
      where: { userId },
      relations: ['user', 'documents'],
    });
  }

  async getOrCreateForUser(user: User): Promise<UserKyc> {
    const existing = await this.findByUserId(user.id);
    if (existing) {
      return existing;
    }

    return this.create({
      userId: user.id,
      user,
      status: user.kycStatus ?? KycStatus.NOT_STARTED,
      provider: user.kycProvider ?? null,
      country: user.country ?? null,
      countryCode: user.countryCode ?? null,
      submittedAt: user.kycSubmittedAt ?? null,
      reviewedAt: user.kycReviewedAt ?? null,
    });
  }
}
