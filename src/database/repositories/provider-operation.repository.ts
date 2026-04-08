import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ProviderOperationType } from 'src/common/enum/provider-operation.enum';
import { AbstractRepository } from 'src/database/abstract.repository';
import { Repository } from 'typeorm';
import { ProviderOperation } from '../entities/provider-operation.entity';

@Injectable()
export class ProviderOperationRepository extends AbstractRepository<ProviderOperation> {
  protected readonly logger = new Logger(ProviderOperationRepository.name);

  constructor(
    @InjectRepository(ProviderOperation)
    protected readonly providerOperationEntityRepository: Repository<ProviderOperation>,
  ) {
    super(providerOperationEntityRepository);
  }

  async findByReference(reference: string): Promise<ProviderOperation | null> {
    return this.findOne({
      where: {
        reference,
      },
    });
  }

  async findByReferenceForUserAndType(
    reference: string,
    userId: string,
    operationType: ProviderOperationType,
  ): Promise<ProviderOperation | null> {
    return this.findOne({
      where: {
        reference,
        userId,
        operationType,
      },
    });
  }
}
