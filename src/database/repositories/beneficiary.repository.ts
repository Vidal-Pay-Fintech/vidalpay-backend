import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { AbstractRepository } from 'src/database/abstract.repository';
import { Beneficiary } from 'src/database/entities/beneficiary.entity';
import { PageOptionsDto } from 'src/common/pagination/pageOptionsDto.dto';
import { PageMetaDto } from 'src/common/pagination/meta.dto';
import { PageDto } from 'src/common/pagination/page.dto';
import { User } from '../entities/user.entity';
// import { API_MESSAGES } from 'src/utils/apiMessages';
// import {
//   PageOptionsDto,
//   ReportRange,
// } from 'src/common/pagination/pageOptionsDto.dto';

@Injectable()
export class BeneficiaryRepository extends AbstractRepository<Beneficiary> {
  protected readonly logger = new Logger(BeneficiaryRepository.name);

  constructor(
    @InjectRepository(Beneficiary)
    protected readonly beneficiaryEntityRepository: Repository<Beneficiary>,
  ) {
    super(beneficiaryEntityRepository);
  }

  public async getUserBeneficiaries(
    pageOptionsDto: PageOptionsDto,
    userId: string,
  ) {
    this.logger.log(`Fetching all users with pagination`);
    console.log(pageOptionsDto, 'THE PAGE OPTIONS');
    console.log(userId, 'USERIDOOOOOOO');
    const { search, role, skip, isExport } = pageOptionsDto;
    const query = this.beneficiaryEntityRepository
      .createQueryBuilder('beneficiary')
      .where('beneficiary.senderId = :userId', { userId });

    query.leftJoinAndMapOne(
      'beneficiary.recipient',
      User,
      'recipient',
      'beneficiary.beneficiaryId = recipient.id',
    );

    // Apply search filters if a search term is provided
    if (search) {
      query.where(
        new Brackets((qb) => {
          qb.where('recipient.id LIKE :search', { search: `%${search}%` })
            .orWhere('recipient.firstName LIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('recipient.lastName LIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('recipient.tagId LIKE :search', {
              search: `%${search}%`,
            });
        }),
      );
    }

    console.log(pageOptionsDto, 'THE PAGE OPTIONS DTO');

    if (pageOptionsDto.from && pageOptionsDto.to) {
      query.andWhere('beneficiary.createdAt BETWEEN :from AND :to', {
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
      return await query.orderBy('beneficiary.createdAt', 'DESC').getMany();
    }

    const [entities, itemCount] = await query
      .skip(skip || (page - 1) * limit)
      .take(limit)
      .orderBy('beneficiary.createdAt', 'DESC')
      .getManyAndCount();

    // Return paginated result
    const pageMetaDto = new PageMetaDto({ itemCount, pageOptionsDto });
    return new PageDto(entities, pageMetaDto);
  }

  /**
   * Delete a beneficiary by ID and sender ID
   * @param beneficiaryId - The ID of the beneficiary to delete
   * @param senderId - The ID of the user who owns the beneficiary
   * @returns Promise<void>
   * @throws NotFoundException if beneficiary not found
   */
  public async deleteBeneficiary(
    beneficiaryId: string,
    senderId: string,
  ): Promise<void> {
    // First, check if the beneficiary exists and belongs to the sender
    const beneficiary = await this.beneficiaryEntityRepository.findOne({
      where: {
        id: beneficiaryId,
        senderId: senderId,
      },
    });

    if (!beneficiary) {
      this.logger.warn(
        `Beneficiary with ID ${beneficiaryId} not found for sender ${senderId}`,
      );
      throw new NotFoundException(
        `Beneficiary not found or you don't have permission to delete it`,
      );
    }

    // Delete the beneficiary
    await this.beneficiaryEntityRepository.delete({
      id: beneficiaryId,
      senderId: senderId,
    });

    this.logger.log(
      `Successfully deleted beneficiary with ID: ${beneficiaryId}`,
    );
  }
}
