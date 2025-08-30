// import { Injectable, Logger, NotFoundException } from '@nestjs/common';
// import { InjectRepository } from '@nestjs/typeorm';
// import { Brackets, Repository } from 'typeorm';
// import { AbstractRepository } from 'src/database/abstract.repository';
// import { Beneficiary } from 'src/beneficiary/entities/beneficiary.entity';
// // import { API_MESSAGES } from 'src/utils/apiMessages';
// import {
//   PageOptionsDto,
//   ReportRange,
// } from 'src/common/pagination/pageOptionsDto.dto';
// import { PageMetaDto } from 'src/common/pagination/meta.dto';
// import { PageDto } from 'src/common/pagination/page.dto';
// import { BeneficiaryEntity } from '../entities/beneficiary.entity';

// @Injectable()
// export class BeneficiaryRepository extends AbstractRepository<BeneficiaryEntity> {
//   protected readonly logger = new Logger(BeneficiaryRepository.name);

//   constructor(
//     @InjectRepository(Beneficiary)
//     protected readonly beneficiaryEntityRepository: Repository<BeneficiaryEntity>,
//   ) {
//     super(beneficiaryEntityRepository);
//   }

//   public async getUserBeneficiaries(
//     pageOptionsDto: PageOptionsDto,
//     userId: string,
//   ) {
//     this.logger.log(`Fetching all users with pagination`);
//     console.log(pageOptionsDto, 'THE PAGE OPTIONS');
//     const { search, role, skip, isExport } = pageOptionsDto;
//     const query = this.beneficiaryEntityRepository
//       .createQueryBuilder('beneficiary')
//       .where('beneficiary.userId = :userId', { userId });

//     // Apply search filters if a search term is provided
//     if (search) {
//       query.where(
//         new Brackets((qb) => {
//           qb.where('beneficiary.id LIKE :search', { search: `%${search}%` })
//             .orWhere('beneficiary.firstName LIKE :search', {
//               search: `%${search}%`,
//             })
//             .orWhere('beneficiary.lastName LIKE :search', {
//               search: `%${search}%`,
//             })
//             .orWhere('beneficiary.tagId LIKE :search', {
//               search: `%${search}%`,
//             });
//         }),
//       );
//     }

//     console.log(pageOptionsDto, 'THE PAGE OPTIONS DTO');

//     if (pageOptionsDto.from && pageOptionsDto.to) {
//       query.andWhere('beneficiary.createdAt BETWEEN :from AND :to', {
//         from: pageOptionsDto.from,
//         to: pageOptionsDto.to,
//       });
//     }

//     const page = Number(pageOptionsDto.page) || 1;
//     const limit = Number(pageOptionsDto.limit) || 50;

//     console.log(page, limit, 'THE PAGE');
//     console.log(isExport, 'THE EXPORT');
//     if (isExport) {
//       console.log('EXPORTING');
//       return await query.orderBy('beneficiary.createdAt', 'DESC').getMany();
//     }

//     const [entities, itemCount] = await query
//       .skip(skip || (page - 1) * limit)
//       .take(limit)
//       .orderBy('beneficiary.createdAt', 'DESC')
//       .getManyAndCount();

//     // Return paginated result
//     const pageMetaDto = new PageMetaDto({ itemCount, pageOptionsDto });
//     return new PageDto(entities, pageMetaDto);
//   }
// }
