import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/pagination/page.dto';
import { PageMetaDto } from 'src/common/pagination/meta.dto';
import { PageOptionsDto } from 'src/common/pagination/pageOptionsDto.dto';
import { AbstractRepository } from 'src/database/abstract.repository';
import { TransactionEntity } from 'src/database/entities/transaction.entity';
import { TransactionType } from 'src/utils/enums/transaction-type.enum';
import { Brackets, Repository } from 'typeorm';

@Injectable()
export class TransactionRepository extends AbstractRepository<TransactionEntity> {
  protected readonly logger = new Logger(TransactionRepository.name);

  constructor(
    @InjectRepository(TransactionEntity)
    protected readonly transactionEntityRepository: Repository<TransactionEntity>,
  ) {
    super(transactionEntityRepository);
  }

  async getUserTransactions(
    pageOptionsDto: PageOptionsDto,
    userId: string,
  ): Promise<PageDto<TransactionEntity> | TransactionEntity[]> {
    const { search, skip, isExport, transactionType, status } = pageOptionsDto;
    const query = this.transactionEntityRepository
      .createQueryBuilder('transaction')
      .where('transaction.userId = :userId', { userId });

    if (search) {
      query.andWhere(
        new Brackets((qb) => {
          qb.where('transaction.info LIKE :search', { search: `%${search}%` })
            .orWhere('transaction.currency LIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('transaction.tag LIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('transaction.id LIKE :search', { search: `%${search}%` })
            .orWhere('transaction.reference LIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('transaction.description LIKE :search', {
              search: `%${search}%`,
            });
        }),
      );
    }

    if (transactionType) {
      const normalizedType = transactionType.toLowerCase();
      if (normalizedType === TransactionType.CREDIT || normalizedType === TransactionType.DEBIT) {
        query.andWhere('transaction.type = :type', { type: normalizedType });
      }
    }

    if (status) {
      query.andWhere('transaction.info LIKE :status', {
        status: `%${status}%`,
      });
    }

    if (pageOptionsDto.from && pageOptionsDto.to) {
      query.andWhere('transaction.createdAt BETWEEN :from AND :to', {
        from: pageOptionsDto.from,
        to: pageOptionsDto.to,
      });
    }

    const page = Number(pageOptionsDto.page) || 1;
    const limit = Number(pageOptionsDto.limit) || 50;

    if (isExport) {
      return query.orderBy('transaction.createdAt', 'DESC').getMany();
    }

    const [entities, itemCount] = await query
      .skip(skip || (page - 1) * limit)
      .take(limit)
      .orderBy('transaction.createdAt', 'DESC')
      .getManyAndCount();

    return new PageDto(
      entities,
      new PageMetaDto({
        itemCount,
        pageOptionsDto,
      }),
    );
  }

  async findUserTransactionById(
    userId: string,
    id: string,
  ): Promise<TransactionEntity> {
    const transaction = await this.transactionEntityRepository.findOne({
      where: {
        id,
        userId,
      },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found.');
    }

    return transaction;
  }
}
