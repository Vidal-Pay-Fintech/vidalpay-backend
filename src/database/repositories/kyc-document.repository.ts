import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AbstractRepository } from 'src/database/abstract.repository';
import { KycDocument } from '../entities/kyc-document.entity';

@Injectable()
export class KycDocumentRepository extends AbstractRepository<KycDocument> {
  protected readonly logger = new Logger(KycDocumentRepository.name);

  constructor(
    @InjectRepository(KycDocument)
    protected readonly kycDocumentEntityRepository: Repository<KycDocument>,
  ) {
    super(kycDocumentEntityRepository);
  }

  async findByUserId(userId: string): Promise<KycDocument[]> {
    return this.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }
}
