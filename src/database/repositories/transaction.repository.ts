import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { AbstractRepository } from 'src/database/abstract.repository';
import { TransactionEntity } from '../entities/transaction.entity';
// import { API_MESSAGES } from 'src/utils/apiMessages';
import {
  PageOptionsDto,
  ReportRange,
} from 'src/common/pagination/pageOptionsDto.dto';
import { PageMetaDto } from 'src/common/pagination/meta.dto';
import { PageDto } from 'src/common/pagination/page.dto';

@Injectable()
export class TransactionRepository extends AbstractRepository<TransactionEntity> {
  protected readonly logger = new Logger(TransactionRepository.name);

  constructor(
    @InjectRepository(TransactionEntity)
    protected readonly transactionEntityRepository: Repository<TransactionEntity>,
  ) {
    super(transactionEntityRepository);
  }

  public async getUserTransactions(
    pageOptionsDto: PageOptionsDto,
    userId: string,
  ) {
    this.logger.log(`Fetching all users with pagination`);
    console.log(pageOptionsDto, 'THE PAGE OPTIONS');
    const { search, role, skip, isExport } = pageOptionsDto;
    const query = this.transactionEntityRepository
      .createQueryBuilder('transaction')
      .where('transaction.userId = :userId', { userId });

    // Apply search filters if a search term is provided
    if (search) {
      query.where(
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
            });
        }),
      );
    }

    console.log(pageOptionsDto, 'THE PAGE OPTIONS DTO');

    if (pageOptionsDto.from && pageOptionsDto.to) {
      query.andWhere('transaction.createdAt BETWEEN :from AND :to', {
        from: pageOptionsDto.from,
        to: pageOptionsDto.to,
      });
    }

    const page = Number(pageOptionsDto.page) || 1;
    const limit = Number(pageOptionsDto.limit) || 50;

    console.log(page, limit, 'THE PAGE');
    console.log(isExport, 'THE EXPORT');
    if (isExport) {
      console.log('EXPORTING');
      return await query.orderBy('transaction.createdAt', 'DESC').getMany();
    }

    const [entities, itemCount] = await query
      .skip(skip || (page - 1) * limit)
      .take(limit)
      .orderBy('transaction.createdAt', 'DESC')
      .getManyAndCount();

    // Return paginated result
    const pageMetaDto = new PageMetaDto({ itemCount, pageOptionsDto });
    return new PageDto(entities, pageMetaDto);
  }
}
