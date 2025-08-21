import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AbstractRepository } from 'src/database/abstract.repository';
import { RequestLog } from '../entities/request-log.entity';
import { PageOptionsDto } from 'src/common/pagination/pageOptionsDto.dto';
import { User } from '../entities/user.entity';
import { PageMetaDto } from 'src/common/pagination/meta.dto';
import { PageDto } from 'src/common/pagination/page.dto';

@Injectable()
export class RequestLogRepository extends AbstractRepository<RequestLog> {
  protected readonly logger = new Logger(RequestLogRepository.name);

  constructor(
    @InjectRepository(RequestLog)
    protected readonly requestLogEntityRepository: Repository<RequestLog>,
  ) {
    super(requestLogEntityRepository);
  }

  public async getRequestLogs(pageOptionsDto: PageOptionsDto) {
    const { search, isExport } = pageOptionsDto;
    const queryBuilder =
      this.requestLogEntityRepository.createQueryBuilder('request_log');

    if (search) {
      queryBuilder.andWhere(
        'user.email LIKE :search OR user.firstName LIKE :search OR request_log.requestPath LIKE :search',
        {
          search: `%${search}%`,
        },
      );
    }

    if (pageOptionsDto.from && pageOptionsDto.to) {
      queryBuilder.andWhere('request_log.createdAt BETWEEN :from AND :to', {
        from: pageOptionsDto.from,
        to: pageOptionsDto.to,
      });
    }

    queryBuilder.leftJoinAndMapOne(
      'request_log.user',
      User,
      'user',
      'user.id = request_log.userId',
    );

    const page = Number(pageOptionsDto.page) || 1;
    const limit = Number(pageOptionsDto.limit) || 50;

    if (isExport) {
      return await queryBuilder.getMany();
    }

    const [entities, itemCount] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('request_log.createdAt', 'DESC')
      .getManyAndCount();

    const pageMetaDto = new PageMetaDto({ itemCount, pageOptionsDto });
    return new PageDto(entities, pageMetaDto);
  }
}
