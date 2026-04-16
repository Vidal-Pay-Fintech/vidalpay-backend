import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/pagination/page.dto';
import { PageMetaDto } from 'src/common/pagination/meta.dto';
import { PageOptionsDto } from 'src/common/pagination/pageOptionsDto.dto';
import { AbstractRepository } from 'src/database/abstract.repository';
import { Beneficiary, BeneficiaryType } from 'src/database/entities/beneficiary.entity';
import { User } from 'src/database/entities/user.entity';
import { Currency } from 'src/utils/enums/wallet.enum';
import { Brackets, Repository } from 'typeorm';

@Injectable()
export class BeneficiaryRepository extends AbstractRepository<Beneficiary> {
  protected readonly logger = new Logger(BeneficiaryRepository.name);

  constructor(
    @InjectRepository(Beneficiary)
    protected readonly beneficiaryEntityRepository: Repository<Beneficiary>,
  ) {
    super(beneficiaryEntityRepository);
  }

  async getUserBeneficiaries(
    pageOptionsDto: PageOptionsDto,
    userId: string,
  ): Promise<PageDto<Beneficiary> | Beneficiary[]> {
    const { search, skip, isExport } = pageOptionsDto;
    const query = this.beneficiaryEntityRepository
      .createQueryBuilder('beneficiary')
      .leftJoinAndMapOne(
        'beneficiary.recipient',
        User,
        'recipient',
        'beneficiary.beneficiaryId = recipient.id',
      )
      .where('beneficiary.senderId = :userId', { userId });

    if (search) {
      query.andWhere(
        new Brackets((qb) => {
          qb.where('beneficiary.displayName LIKE :search', {
            search: `%${search}%`,
          })
            .orWhere('beneficiary.accountName LIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('beneficiary.bankName LIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('beneficiary.accountNumber LIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('beneficiary.tagId LIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('recipient.firstName LIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('recipient.lastName LIKE :search', {
              search: `%${search}%`,
            });
        }),
      );
    }

    if (pageOptionsDto.from && pageOptionsDto.to) {
      query.andWhere('beneficiary.createdAt BETWEEN :from AND :to', {
        from: pageOptionsDto.from,
        to: pageOptionsDto.to,
      });
    }

    const page = Number(pageOptionsDto.page) || 1;
    const limit = Number(pageOptionsDto.limit) || 50;

    if (isExport) {
      return query.orderBy('beneficiary.updatedAt', 'DESC').getMany();
    }

    const [entities, itemCount] = await query
      .skip(skip || (page - 1) * limit)
      .take(limit)
      .orderBy('beneficiary.updatedAt', 'DESC')
      .getManyAndCount();

    return new PageDto(
      entities,
      new PageMetaDto({
        itemCount,
        pageOptionsDto,
      }),
    );
  }

  async findInternalBeneficiary(
    senderId: string,
    beneficiaryId: string,
  ): Promise<Beneficiary | null> {
    return this.findOne({
      where: {
        senderId,
        beneficiaryId,
        type: BeneficiaryType.INTERNAL_TAG,
      },
    });
  }

  async findBankBeneficiary(
    senderId: string,
    currency: Currency,
    accountNumber: string,
    bankCode?: string | null,
  ): Promise<Beneficiary | null> {
    const query = this.beneficiaryEntityRepository
      .createQueryBuilder('beneficiary')
      .where('beneficiary.senderId = :senderId', { senderId })
      .andWhere('beneficiary.type = :type', {
        type: BeneficiaryType.BANK_ACCOUNT,
      })
      .andWhere('beneficiary.currency = :currency', { currency })
      .andWhere('beneficiary.accountNumber = :accountNumber', { accountNumber });

    if (bankCode) {
      query.andWhere('beneficiary.bankCode = :bankCode', { bankCode });
    }

    return query.getOne();
  }

  async upsertInternalRecipient(input: {
    senderId: string;
    beneficiaryId: string;
    tagId: string | null;
    displayName: string | null;
    currency: Currency;
  }): Promise<Beneficiary> {
    const existing = await this.findInternalBeneficiary(
      input.senderId,
      input.beneficiaryId,
    );

    if (existing) {
      await this.findOneAndUpdate(existing.id, {
        tagId: input.tagId ?? undefined,
        displayName: input.displayName ?? undefined,
        currency: input.currency,
        lastUsedAt: new Date(),
      });

      return (await this.findOne({ where: { id: existing.id } })) as Beneficiary;
    }

    return this.create({
      senderId: input.senderId,
      beneficiaryId: input.beneficiaryId,
      type: BeneficiaryType.INTERNAL_TAG,
      tagId: input.tagId,
      displayName: input.displayName,
      currency: input.currency,
      lastUsedAt: new Date(),
    });
  }

  async upsertBankRecipient(input: {
    senderId: string;
    currency: Currency;
    accountNumber: string;
    accountName?: string | null;
    bankName?: string | null;
    routingNumber?: string | null;
    bankCode?: string | null;
    displayName?: string | null;
    provider?: any;
    metadata?: Record<string, any> | null;
  }): Promise<Beneficiary> {
    const existing = await this.findBankBeneficiary(
      input.senderId,
      input.currency,
      input.accountNumber,
      input.bankCode,
    );

    const patch = {
      type: BeneficiaryType.BANK_ACCOUNT,
      currency: input.currency,
      accountNumber: input.accountNumber,
      accountName: input.accountName ?? null,
      bankName: input.bankName ?? null,
      routingNumber: input.routingNumber ?? null,
      bankCode: input.bankCode ?? null,
      displayName: input.displayName ?? input.accountName ?? null,
      provider: input.provider ?? null,
      metadata: input.metadata ?? null,
      lastUsedAt: new Date(),
    };

    if (existing) {
      await this.findOneAndUpdate(existing.id, patch);
      return (await this.findOne({ where: { id: existing.id } })) as Beneficiary;
    }

    return this.create({
      senderId: input.senderId,
      beneficiaryId: null,
      ...patch,
    });
  }

  async deleteBeneficiary(beneficiaryId: string, senderId: string): Promise<void> {
    const beneficiary = await this.beneficiaryEntityRepository.findOne({
      where: {
        id: beneficiaryId,
        senderId,
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

    await this.beneficiaryEntityRepository.delete({
      id: beneficiaryId,
      senderId,
    });
  }
}
