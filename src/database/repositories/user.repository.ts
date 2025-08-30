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
import { Wallet } from '../entities/wallet.entity';
// import { Role } from 'src/common/enum/role.enum';
import { PageMetaDto } from 'src/common/pagination/meta.dto';
import {
  PageOptionsDto,
  ReportRange,
} from 'src/common/pagination/pageOptionsDto.dto';
import { PageDto } from 'src/common/pagination/page.dto';

@Injectable()
export class UserRepository extends AbstractRepository<User> {
  protected readonly logger = new Logger(UserRepository.name);

  constructor(
    @InjectRepository(User)
    protected readonly userEntityRepository: Repository<User>,
  ) {
    super(userEntityRepository);
  }

  async createUser(userInfo: Partial<User>): Promise<User> {
    this.logger.log(`Creating user with email:userInfo`);
    return await this.create(userInfo);
  }

  async checkIsUserAccountSuspended(userId: string): Promise<User> {
    this.logger.log(`Checking if user account is suspended: ${userId}`);
    const user = await this.findUserById(userId);
    if (user.status === AccountStatus.SUSPENDED) {
      throw new BadRequestException(API_MESSAGES.ACCOUNT_SUSPENDED);
    }
    return user;
  }

  async getUserStats() {
    //GET THE VERIFIED, UNVERIED AND TOTAL USERS
    const verifiedUsers = await this.userEntityRepository.count({
      where: { isVerified: true },
    });
    const unverifiedUsers = await this.userEntityRepository.count({
      where: { isVerified: false },
    });
    const totalUsers = await this.userEntityRepository.count();

    return {
      verifiedUsers,
      unverifiedUsers,
      totalUsers,
    };
  }

  async findAll(): Promise<User[]> {
    this.logger.log(`Fetching all users`);
    return await this.userEntityRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async getAllUsers(pageOptionsDto: PageOptionsDto) {
    this.logger.log(`Fetching all users with pagination`);

    const { search, role, skip, isExport } = pageOptionsDto;
    const query = this.userEntityRepository.createQueryBuilder('user');

    // Apply search filters if a search term is provided
    if (search) {
      query.where(
        new Brackets((qb) => {
          qb.where('user.firstName LIKE :search', { search: `%${search}%` })
            .orWhere('user.lastName LIKE :search', { search: `%${search}%` })
            .orWhere('user.email LIKE :search', { search: `%${search}%` })
            .orWhere('user.id LIKE :search', { search: `%${search}%` })
            .orWhere('user.tagId LIKE :search', { search: `%${search}%` })
            .orWhere('user.phoneNumber LIKE :search', {
              search: `%${search}%`,
            });
        }),
      );
    }

    // if (role) {
    //   if (role === Role.REGULAR) {
    //     query.andWhere('user.role = :role', { role: Role.REGULAR });
    //   } else {
    //     query.andWhere('user.role != :role', { role: Role.REGULAR });
    //   }
    //   // query.andWhere('user.role = :role', { role });
    // }

    if (pageOptionsDto.from && pageOptionsDto.to) {
      query.andWhere('user.createdAt BETWEEN :from AND :to', {
        from: pageOptionsDto.from,
        to: pageOptionsDto.to,
      });
    }

    const page = Number(pageOptionsDto.page) || 1;
    const limit = Number(pageOptionsDto.limit) || 50;

    if (isExport) {
      return await query.orderBy('user.createdAt', 'DESC').getMany();
    }

    const [entities, itemCount] = await query
      .skip(skip || (page - 1) * limit)
      .take(limit)
      .orderBy('user.createdAt', 'DESC')
      .getManyAndCount();

    // Return paginated result
    const pageMetaDto = new PageMetaDto({ itemCount, pageOptionsDto });
    return new PageDto(entities, pageMetaDto);
  }

  async getAllUsersBasicInfo(pageOptionsDto: PageOptionsDto) {
    this.logger.log(`Fetching all users with pagination`);

    const { search, role, skip, isExport } = pageOptionsDto;
    const query = this.userEntityRepository
      .createQueryBuilder('user')
      .select(['user.firstName', 'user.lastName', 'user.tagId']);

    // Apply search filters if a search term is provided
    if (search) {
      query.where(
        new Brackets((qb) => {
          qb.where('user.firstName LIKE :search', { search: `%${search}%` })
            .orWhere('user.lastName LIKE :search', { search: `%${search}%` })
            .orWhere('user.email LIKE :search', { search: `%${search}%` })
            .orWhere('user.id LIKE :search', { search: `%${search}%` })
            .orWhere('user.tagId LIKE :search', { search: `%${search}%` })
            .orWhere('user.phoneNumber LIKE :search', {
              search: `%${search}%`,
            });
        }),
      );
    }

    // if (role) {
    //   if (role === Role.REGULAR) {
    //     query.andWhere('user.role = :role', { role: Role.REGULAR });
    //   } else {
    //     query.andWhere('user.role != :role', { role: Role.REGULAR });
    //   }
    //   // query.andWhere('user.role = :role', { role });
    // }

    if (pageOptionsDto.from && pageOptionsDto.to) {
      query.andWhere('user.createdAt BETWEEN :from AND :to', {
        from: pageOptionsDto.from,
        to: pageOptionsDto.to,
      });
    }

    const page = Number(pageOptionsDto.page) || 1;
    const limit = Number(pageOptionsDto.limit) || 50;

    if (isExport) {
      return await query.orderBy('user.createdAt', 'DESC').getMany();
    }

    const [entities, itemCount] = await query
      .skip(skip || (page - 1) * limit)
      .take(limit)
      .orderBy('user.createdAt', 'DESC')
      .getManyAndCount();

    // Return paginated result
    const pageMetaDto = new PageMetaDto({ itemCount, pageOptionsDto });
    return new PageDto(entities, pageMetaDto);
  }
  async findUserByEmail(email: string): Promise<User | null> {
    this.logger.log(`Fetching user with email: ${email}`);
    return await this.findOne({
      where: { email },
    });
  }

  async findUserByPhone(phoneNumber: string): Promise<User | null> {
    this.logger.log(`Fetching user with phoneNumber: ${phoneNumber}`);
    return await this.findOne({
      where: { phoneNumber },
    });
  }

  // async findUserByEmailOrPhone(value: string): Promise<User | null> {
  //   this.logger.log(`Fetching user with email or phone: ${value}`);

  //   const user = await this.userEntityRepository
  //     .createQueryBuilder('user')
  //     .where('user.email = :value', { value })
  //     .getOne();

  //   if (!user) {
  //     return await this.userEntityRepository
  //       .createQueryBuilder('user')
  //       .orWhere((qb) => {
  //         if (value.startsWith('0')) {
  //           value = value.replace(/^0/, '+234');
  //         }
  //         qb.where('user.phoneNumber = :value', { value });
  //       })
  //       .getOne();
  //   }

  //   return user;
  // }

  async findUserByEmailOrPhone(value: string): Promise<User | null> {
    this.logger.log(`Fetching user with email or phone: ${value}`);

    // First try to find by email
    const userByEmail = await this.userEntityRepository
      .createQueryBuilder('user')
      .where('user.email = :value', { value })
      .getOne();

    if (userByEmail) {
      return userByEmail;
    }

    // If not found by email, try by phone number with phone formatting logic
    let phoneValue = value;
    if (value.startsWith('0')) {
      phoneValue = value.replace(/^0/, '+234');
    }

    const userByPhone = await this.userEntityRepository
      .createQueryBuilder('user')
      .where('user.phoneNumber = :phoneValue', { phoneValue })
      .getOne();

    return userByPhone;
  }
  async findUserById(id: string): Promise<User> {
    this.logger.log(`Fetching user with id: ${id}`);
    const queryBuilder = this.userEntityRepository
      .createQueryBuilder('user')
      .where('user.id = :id', { id });

    //JOIN THE WALLET TABLE TO FETCH THE WALLET BALANCE
    // queryBuilder.leftJoinAndMapOne(
    //   'user.wallet',
    //   Wallet,
    //   'wallet',
    //   'wallet.userId = user.id', // Fixed syntax
    // );

    const user = await queryBuilder.getOne();
    if (!user) {
      throw new BadRequestException(API_MESSAGES.USER_NOT_FOUND);
    }
    return user;
  }

  async getUserById(id: string): Promise<User> {
    this.logger.log(`Fetching user with id: ${id}`);
    const queryBuilder = this.userEntityRepository
      .createQueryBuilder('user')
      .where('user.id = :id', { id });

    //JOIN THE WALLET TABLE TO FETCH THE WALLET BALANCE
    queryBuilder.leftJoinAndMapMany(
      'user.wallet',
      Wallet,
      'wallet',
      'wallet.userId = user.id',
    );

    const user = await queryBuilder.getOne();
    if (!user) {
      throw new BadRequestException(API_MESSAGES.USER_NOT_FOUND);
    }
    return user;
  }
  async findUserByTag(tag: string): Promise<User> {
    this.logger.log(`Fetching user with tag: ${tag}`);
    const user = await this.userEntityRepository.findOne({
      where: {
        tagId: tag,
      },
    });

    if (!user) {
      throw new BadRequestException(API_MESSAGES.USER_NOT_FOUND);
    }
    return user;
  }

  async checkUserExistByEmail(email: string): Promise<boolean> {
    this.logger.log(`Checking if user with email: ${email} exists`);
    const user = await this.findOne({
      where: { email: email },
    });
    if (user) {
      throw new UnprocessableEntityException(API_MESSAGES.EMAIL_ALREADY_EXISTS);
    }
    return true;
  }

  async checkUserExistByPhone(phoneNumber: string): Promise<boolean> {
    this.logger.log(
      `Checking if user with phone number: ${phoneNumber} exists`,
    );
    const user = await this.findOne({
      where: { phoneNumber: phoneNumber },
    });
    if (user) {
      throw new UnprocessableEntityException(API_MESSAGES.PHONE_ALREADY_EXISTS);
    }
    return true;
  }

  //   async findAdmins(): Promise<User[]> {
  //     this.logger.log(`Fetching all admins`);
  //     return await this.userEntityRepository.find({
  //       where: { role: Role.SUPER_ADMIN },
  //       order: { createdAt: 'DESC' },
  //     });
  //   }

  async getUserReport(pageOptionsDto: PageOptionsDto) {
    const { reportRange, from, to } = pageOptionsDto;
    const queryBuilder = this.userEntityRepository.createQueryBuilder('user');

    // Calculate the start and end dates based on the report range
    const endDate = new Date();
    const startDate = new Date();

    // Determine the grouping and date range logic
    let groupByClause: string;
    let periodSelect: string;
    let rangeDays = 0;

    switch (reportRange) {
      case ReportRange.DAILY:
        rangeDays = 30;
        startDate.setDate(endDate.getDate() - rangeDays);
        groupByClause = `YEAR(user.createdAt), DATE(user.createdAt)`;
        periodSelect = `DATE(user.createdAt) AS period, YEAR(user.createdAt) AS year`;
        break;

      case ReportRange.WEEKLY:
        rangeDays = 7 * 12; // Last 12 weeks
        startDate.setDate(endDate.getDate() - rangeDays);
        groupByClause = `YEAR(user.createdAt), YEARWEEK(user.createdAt, 1)`;
        periodSelect = `YEARWEEK(user.createdAt, 1) AS period, YEAR(user.createdAt) AS year`;
        break;

      case ReportRange.MONTHLY:
        startDate.setMonth(endDate.getMonth() - 12); // Last 12 months
        groupByClause = `YEAR(user.createdAt), MONTH(user.createdAt)`;
        periodSelect = `MONTH(user.createdAt) AS period, YEAR(user.createdAt) AS year`;
        break;

      case ReportRange.QUARTERLY:
        startDate.setMonth(endDate.getMonth() - 12); // Last 4 quarters (1 year)
        groupByClause = `YEAR(user.createdAt), QUARTER(user.createdAt)`;
        periodSelect = `QUARTER(user.createdAt) AS period, YEAR(user.createdAt) AS year`;
        break;

      case ReportRange.YEARLY:
        startDate.setFullYear(endDate.getFullYear() - 5); // Last 5 years
        groupByClause = `YEAR(user.createdAt)`;
        periodSelect = `YEAR(user.createdAt) AS period, YEAR(user.createdAt) AS year`;
        break;

      //   case ReportRange.CUSTOM:
      //     startDate.setTime(Date.parse(from));
      //     endDate.setTime(Date.parse(to));
      //     groupByClause = `DATE(user.createdAt), YEAR(user.createdAt)`;
      //     periodSelect = `DATE(user.createdAt) AS period, YEAR(user.createdAt) AS year`;
      //     break;

      default:
        startDate.setMonth(endDate.getMonth() - 12); // Default to last 12 months
        groupByClause = `YEAR(user.createdAt), MONTH(user.createdAt)`;
        periodSelect = `MONTH(user.createdAt) AS period, YEAR(user.createdAt) AS year`;
        break;
    }

    // Query users and calculate breakdown
    const entities = await queryBuilder
      .select(`${periodSelect}`) // Include dynamic period and year
      .addSelect('COUNT(user.id)', 'totalUsers')
      .addSelect(
        `SUM(CASE WHEN user.isVerified = true THEN 1 ELSE 0 END)`,
        'totalVerified',
      )
      .addSelect(
        `SUM(CASE WHEN user.isVerified = false THEN 1 ELSE 0 END)`,
        'totalUnverified',
      )
      .where('user.createdAt BETWEEN :startDate AND :endDate', {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      })
      .groupBy(groupByClause)
      .orderBy('year', 'ASC')
      .addOrderBy('period', 'ASC')
      .getRawMany();

    // Map and format results
    return entities.map((entity) => ({
      year: entity.year,
      period: entity.period,
      totalUsers: parseInt(entity.totalUsers, 10) || 0,
      totalVerified: parseInt(entity.totalVerified, 10) || 0,
      totalUnverified: parseInt(entity.totalUnverified, 10) || 0,
      reportRange: reportRange || ReportRange.MONTHLY,
    }));
  }

  //   public async findAllAdminsByRole(role: Role): Promise<User[]> {
  //     this.logger.log(`Fetching all admins with role: ${role}`);
  //     return await this.userEntityRepository.find({
  //       where: { role },
  //       order: { createdAt: 'DESC' },
  //     });
  //   }
}
