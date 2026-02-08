import {
  BadRequestException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AccountStatus, User } from '../entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { AbstractRepository } from 'src/database/abstract.repository';
import { API_MESSAGES } from 'src/utils/apiMessages';
// import { Wallet } from '../entities/wallet.entity';
// import { Role } from 'src/common/enum/role.enum';
import { PageMetaDto } from 'src/common/pagination/meta.dto';
import {
  PageOptionsDto,
  ReportRange,
} from 'src/common/pagination/pageOptionsDto.dto';
import { PageDto } from 'src/common/pagination/page.dto';
import { Token } from '../entities/token.entity';

@Injectable()
export class TokenRepository extends AbstractRepository<Token> {
  protected readonly logger = new Logger(TokenRepository.name);

  constructor(
    @InjectRepository(User)
    protected readonly tokenEntityRepository: Repository<Token>,
  ) {
    super(tokenEntityRepository);
  }
}
