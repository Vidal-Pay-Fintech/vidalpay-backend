import { BadRequestException, Injectable } from '@nestjs/common';
import { PageOptionsDto } from 'src/common/pagination/pageOptionsDto.dto';
import { Beneficiary, BeneficiaryType } from 'src/database/entities/beneficiary.entity';
import { BeneficiaryRepository } from 'src/database/repositories/beneficiary.repository';
import { UserRepository } from 'src/database/repositories/user.repository';
import { API_MESSAGES } from 'src/utils/apiMessages';
import { Currency } from 'src/utils/enums/wallet.enum';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';

@Injectable()
export class BeneficiaryService {
  constructor(
    private readonly beneficiaryRepository: BeneficiaryRepository,
    private readonly userRepository: UserRepository,
  ) {}

  async create(createBeneficiaryDto: CreateBeneficiaryDto, senderId: string) {
    const type =
      createBeneficiaryDto.type ??
      (createBeneficiaryDto.accountNumber
        ? BeneficiaryType.BANK_ACCOUNT
        : BeneficiaryType.INTERNAL_TAG);

    if (type === BeneficiaryType.INTERNAL_TAG) {
      const recipient =
        createBeneficiaryDto.beneficiaryId
          ? await this.userRepository.getUserById(createBeneficiaryDto.beneficiaryId)
          : createBeneficiaryDto.tagId
            ? await this.userRepository.findUserByTag(createBeneficiaryDto.tagId)
            : null;

      if (!recipient) {
        throw new BadRequestException(API_MESSAGES.USER_NOT_FOUND);
      }

      const saved = await this.beneficiaryRepository.upsertInternalRecipient({
        senderId,
        beneficiaryId: recipient.id,
        tagId: recipient.tagId ?? createBeneficiaryDto.tagId ?? null,
        displayName:
          createBeneficiaryDto.displayName ??
          [recipient.firstName, recipient.lastName].filter(Boolean).join(' ').trim() ??
          null,
        currency: createBeneficiaryDto.currency ?? Currency.NGN,
      });

      return this.serializeBeneficiary(saved, recipient);
    }

    if (!createBeneficiaryDto.accountNumber || !createBeneficiaryDto.currency) {
      throw new BadRequestException(
        'currency and accountNumber are required for bank beneficiaries.',
      );
    }

    const saved = await this.beneficiaryRepository.upsertBankRecipient({
      senderId,
      currency: createBeneficiaryDto.currency,
      accountNumber: createBeneficiaryDto.accountNumber,
      accountName: createBeneficiaryDto.accountName ?? null,
      bankName: createBeneficiaryDto.bankName ?? null,
      routingNumber: createBeneficiaryDto.routingNumber ?? null,
      bankCode: createBeneficiaryDto.bankCode ?? null,
      displayName: createBeneficiaryDto.displayName ?? null,
      provider: createBeneficiaryDto.provider ?? null,
      metadata: createBeneficiaryDto.metadata ?? null,
    });

    return this.serializeBeneficiary(saved);
  }

  async getBeneficiaryForSingleUser(
    pageOptionsDto: PageOptionsDto,
    userId: string,
  ) {
    const result = await this.beneficiaryRepository.getUserBeneficiaries(
      pageOptionsDto,
      userId,
    );

    if (Array.isArray(result)) {
      return result.map((beneficiary) => this.serializeBeneficiary(beneficiary));
    }

    return {
      beneficiaries: result.data.map((beneficiary) =>
        this.serializeBeneficiary(beneficiary),
      ),
      meta: result.meta,
    };
  }

  async deleteBeneficiary(beneficiaryId: string, senderId: string) {
    await this.beneficiaryRepository.deleteBeneficiary(beneficiaryId, senderId);

    return {
      status: true,
      code: 200,
      message: 'Beneficiary deleted successfully',
      data: {
        beneficiaryId,
        deletedAt: new Date().toISOString(),
      },
    };
  }

  findAll() {
    return [];
  }

  findOne(_id: number) {
    return null;
  }

  update(_id: number, _updateBeneficiaryDto: UpdateBeneficiaryDto) {
    return null;
  }

  remove(_id: number) {
    return null;
  }

  private serializeBeneficiary(beneficiary: Beneficiary, recipient?: any) {
    const resolvedRecipient = recipient ?? (beneficiary as any).recipient ?? null;
    const displayName =
      beneficiary.displayName ??
      resolvedRecipient?.displayName ??
      [resolvedRecipient?.firstName, resolvedRecipient?.lastName]
        .filter(Boolean)
        .join(' ')
        .trim() ??
      beneficiary.accountName ??
      null;

    return {
      id: beneficiary.id,
      type: beneficiary.type,
      name: displayName,
      firstName: resolvedRecipient?.firstName ?? null,
      lastName: resolvedRecipient?.lastName ?? null,
      beneficiaryId: beneficiary.beneficiaryId,
      tagId: beneficiary.tagId ?? resolvedRecipient?.tagId ?? null,
      currency: beneficiary.currency,
      accountNumber: beneficiary.accountNumber,
      accountName: beneficiary.accountName,
      bankName: beneficiary.bankName,
      routingNumber: beneficiary.routingNumber,
      bankCode: beneficiary.bankCode,
      provider: beneficiary.provider,
      metadata: beneficiary.metadata,
      lastUsedAt: beneficiary.lastUsedAt,
      createdAt: beneficiary.createdAt,
      updatedAt: beneficiary.updatedAt,
    };
  }
}
