import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PageOptionsDto } from 'src/common/pagination/pageOptionsDto.dto';
import {
  Beneficiary,
  BeneficiaryType,
} from 'src/database/entities/beneficiary.entity';
import { BeneficiaryRepository } from 'src/database/repositories/beneficiary.repository';
import { UserRepository } from 'src/database/repositories/user.repository';
import { ProviderStatusService } from 'src/providers/provider-status.service';
import { UserService } from 'src/user/user.service';
import { API_MESSAGES } from 'src/utils/apiMessages';
import { Currency } from 'src/utils/enums/wallet.enum';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';

type BeneficiaryRail = 'internal' | 'ngn_bank' | 'usd_bank';
type BeneficiaryFlow = 'tag_transfer' | 'bank_transfer';
type ProviderState =
  | 'not_required'
  | 'live'
  | 'demo_safe'
  | 'provider_pending'
  | 'unavailable';

@Injectable()
export class BeneficiaryService {
  constructor(
    private readonly beneficiaryRepository: BeneficiaryRepository,
    private readonly userRepository: UserRepository,
    private readonly userService: UserService,
    private readonly providerStatusService: ProviderStatusService,
  ) {}

  async create(createBeneficiaryDto: CreateBeneficiaryDto, senderId: string) {
    const type =
      createBeneficiaryDto.type ??
      (createBeneficiaryDto.accountNumber
        ? BeneficiaryType.BANK_ACCOUNT
        : BeneficiaryType.INTERNAL_TAG);

    if (type === BeneficiaryType.INTERNAL_TAG) {
      const recipient = createBeneficiaryDto.beneficiaryId
        ? await this.userRepository.getUserById(
            createBeneficiaryDto.beneficiaryId,
          )
        : createBeneficiaryDto.tagId
          ? await this.userRepository.findUserByTag(createBeneficiaryDto.tagId)
          : null;

      if (!recipient) {
        throw new BadRequestException(API_MESSAGES.USER_NOT_FOUND);
      }

      const accountOverview =
        await this.userService.getAccountOverview(senderId);
      const saved = await this.beneficiaryRepository.upsertInternalRecipient({
        senderId,
        beneficiaryId: recipient.id,
        tagId: recipient.tagId ?? createBeneficiaryDto.tagId ?? null,
        displayName:
          createBeneficiaryDto.displayName ??
          [recipient.firstName, recipient.lastName]
            .filter(Boolean)
            .join(' ')
            .trim() ??
          null,
        currency: createBeneficiaryDto.currency ?? Currency.NGN,
      });

      return this.serializeBeneficiary(saved, recipient, accountOverview);
    }

    if (!createBeneficiaryDto.accountNumber || !createBeneficiaryDto.currency) {
      throw new BadRequestException(
        'currency and accountNumber are required for bank beneficiaries.',
      );
    }

    const accountOverview = await this.userService.getAccountOverview(senderId);
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

    return this.serializeBeneficiary(saved, undefined, accountOverview);
  }

  async getBeneficiaryForSingleUser(
    pageOptionsDto: PageOptionsDto,
    userId: string,
  ) {
    const accountOverview = await this.userService.getAccountOverview(userId);
    const result = await this.beneficiaryRepository.getUserBeneficiaries(
      pageOptionsDto,
      userId,
    );

    if (Array.isArray(result)) {
      return result.map((beneficiary) =>
        this.serializeBeneficiary(beneficiary, undefined, accountOverview),
      );
    }

    return {
      beneficiaries: result.data.map((beneficiary) =>
        this.serializeBeneficiary(beneficiary, undefined, accountOverview),
      ),
      meta: result.meta,
    };
  }

  async getBeneficiaryDetail(beneficiaryId: string, userId: string) {
    const beneficiary =
      await this.beneficiaryRepository.findUserBeneficiaryById(
        userId,
        beneficiaryId,
      );

    if (!beneficiary) {
      throw new NotFoundException('Beneficiary not found.');
    }

    const accountOverview = await this.userService.getAccountOverview(userId);

    return this.serializeBeneficiary(beneficiary, undefined, accountOverview);
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

  private serializeBeneficiary(
    beneficiary: Beneficiary,
    recipient?: any,
    accountOverview?: any,
  ) {
    const resolvedRecipient =
      recipient ?? (beneficiary as any).recipient ?? null;
    const displayName =
      beneficiary.displayName ??
      resolvedRecipient?.displayName ??
      [resolvedRecipient?.firstName, resolvedRecipient?.lastName]
        .filter(Boolean)
        .join(' ')
        .trim() ??
      beneficiary.accountName ??
      null;
    const normalizedType =
      beneficiary.type === BeneficiaryType.INTERNAL_TAG ? 'tag' : 'bank';
    const rail = this.resolveRail(beneficiary);
    const flow: BeneficiaryFlow =
      normalizedType === 'tag' ? 'tag_transfer' : 'bank_transfer';
    const requiredCapability =
      normalizedType === 'tag' ? 'canTagTransfer' : 'canBankTransfer';
    const capabilities = accountOverview?.capabilities ?? {};
    const productAvailability = accountOverview?.productAvailability ?? {};
    const providerState = this.resolveProviderState(rail);
    const destinationReady = this.isDestinationReady(beneficiary, rail);
    const capabilityAllowed =
      normalizedType === 'tag'
        ? Boolean(capabilities.canTagTransfer)
        : Boolean(capabilities.canBankTransfer);
    const productAvailable =
      normalizedType === 'tag'
        ? Boolean(
            productAvailability.tagTransfer ??
              productAvailability.internalTransfer ??
              capabilities.canTagTransfer,
          )
        : Boolean(
            productAvailability.bankTransfer ??
              productAvailability.externalTransfer ??
              capabilities.canBankTransfer,
          );
    const providerAllowsTransfer =
      providerState === 'not_required' ||
      providerState === 'live' ||
      providerState === 'demo_safe';
    const canTransfer =
      destinationReady &&
      capabilityAllowed &&
      productAvailable &&
      providerAllowsTransfer;
    const blockedReason = this.resolveBlockedReason({
      beneficiary,
      rail,
      destinationReady,
      capabilityAllowed,
      productAvailable,
      providerState,
      capabilities,
      normalizedType,
    });
    const transferRoute =
      normalizedType === 'tag'
        ? '/api/v1/transfers/internal'
        : '/api/v1/wallet/external-transfer';

    return {
      id: beneficiary.id,
      type: normalizedType,
      legacyType: beneficiary.type,
      name: displayName,
      avatar:
        resolvedRecipient?.profilePicture ??
        beneficiary.metadata?.avatar ??
        null,
      initials: this.buildInitials(displayName),
      rail,
      flow,
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
      canTransfer,
      blockedReason,
      routeEligibility: {
        canTransfer,
        canTagTransfer: Boolean(capabilities.canTagTransfer),
        canBankTransfer: Boolean(capabilities.canBankTransfer),
        requiredCapability,
        productAvailable,
        providerState,
        blockedReason,
      },
      transferContract: {
        method: 'POST',
        path: transferRoute,
        flow,
        rail,
        requiredCapability,
        request: this.buildTransferRequestContract(beneficiary, rail),
        statusStates:
          normalizedType === 'tag'
            ? ['success', 'pending', 'failed']
            : [
                'provider_pending',
                'demo_safe',
                'processing',
                'completed',
                'failed',
                'reversed',
              ],
      },
      receiptContract: {
        includedOnSuccess: normalizedType === 'tag',
        transactionReceiptPath: '/api/v1/transaction/:id/receipt',
        fields: [
          'reference',
          'amount',
          'fee',
          'sourceWallet',
          'recipientName',
          'recipientTagId',
          'timestamp',
          'status',
        ],
      },
      provider: null,
      providerState,
      metadata: {
        ...(beneficiary.metadata ?? {}),
        mobileFlow: flow,
        transferRoute,
        requiredCapability,
      },
      lastUsedAt: beneficiary.lastUsedAt,
      createdAt: beneficiary.createdAt,
      updatedAt: beneficiary.updatedAt,
    };
  }

  private resolveRail(beneficiary: Beneficiary): BeneficiaryRail {
    if (beneficiary.type === BeneficiaryType.INTERNAL_TAG) {
      return 'internal';
    }

    return beneficiary.currency === Currency.USD ? 'usd_bank' : 'ngn_bank';
  }

  private resolveProviderState(rail: BeneficiaryRail): ProviderState {
    if (rail === 'internal') {
      return 'not_required';
    }

    const providerType = rail === 'ngn_bank' ? 'payment_ngn' : 'banking_usd';
    const status = this.providerStatusService
      .getProviderStatuses()
      .find((provider) => provider.providerType === providerType);

    if (!status) {
      return 'unavailable';
    }

    if (status.liveTested && status.enabled) {
      return 'live';
    }

    if (status.mode === 'mock' && status.enabled) {
      return 'demo_safe';
    }

    if (
      status.status === 'PENDING' ||
      status.status === 'COMING_SOON' ||
      status.envConfigured
    ) {
      return 'provider_pending';
    }

    return 'unavailable';
  }

  private isDestinationReady(
    beneficiary: Beneficiary,
    rail: BeneficiaryRail,
  ): boolean {
    if (rail === 'internal') {
      return Boolean(beneficiary.tagId || beneficiary.beneficiaryId);
    }

    if (rail === 'usd_bank') {
      return Boolean(beneficiary.accountNumber && beneficiary.routingNumber);
    }

    return Boolean(
      beneficiary.accountNumber &&
        (beneficiary.bankCode || beneficiary.bankName),
    );
  }

  private resolveBlockedReason(input: {
    beneficiary: Beneficiary;
    rail: BeneficiaryRail;
    destinationReady: boolean;
    capabilityAllowed: boolean;
    productAvailable: boolean;
    providerState: ProviderState;
    capabilities: any;
    normalizedType: 'tag' | 'bank';
  }): string | null {
    if (!input.destinationReady) {
      if (input.rail === 'internal') {
        return 'Saved TAG beneficiary is missing a Vidal Tag.';
      }

      if (input.rail === 'usd_bank') {
        return 'Saved U.S. bank beneficiary requires account and routing details.';
      }

      return 'Saved Nigerian bank beneficiary requires account and bank details.';
    }

    if (!input.productAvailable) {
      return input.normalizedType === 'tag'
        ? API_MESSAGES.TAG_TRANSFER_UNAVAILABLE
        : API_MESSAGES.BANK_TRANSFER_UNAVAILABLE;
    }

    if (!input.capabilityAllowed) {
      return input.normalizedType === 'tag'
        ? (input.capabilities.tagTransferBlockedReason ??
            API_MESSAGES.TAG_TRANSFER_UNAVAILABLE)
        : (input.capabilities.bankTransferBlockedReason ??
            API_MESSAGES.BANK_TRANSFER_UNAVAILABLE);
    }

    if (input.providerState === 'provider_pending') {
      return 'Bank transfer provider is pending live activation.';
    }

    if (input.providerState === 'unavailable') {
      return API_MESSAGES.BANK_TRANSFER_UNAVAILABLE;
    }

    return null;
  }

  private buildTransferRequestContract(
    beneficiary: Beneficiary,
    rail: BeneficiaryRail,
  ) {
    if (rail === 'internal') {
      return {
        requiredFields: ['amount', 'currency', 'recipientTag', 'pin'],
        optionalFields: ['note'],
        prefill: {
          recipientTag: beneficiary.tagId,
          currency: beneficiary.currency ?? Currency.NGN,
        },
      };
    }

    return {
      requiredFields:
        rail === 'usd_bank'
          ? [
              'amount',
              'currency',
              'destinationAccountNumber',
              'destinationRoutingNumber',
              'pin',
            ]
          : [
              'amount',
              'currency',
              'destinationAccountNumber',
              'destinationBankCode',
              'pin',
            ],
      optionalFields: [
        'destinationAccountName',
        'destinationBankName',
        'narration',
        'metadata',
      ],
      prefill: {
        currency: beneficiary.currency,
        destinationAccountNumber: beneficiary.accountNumber,
        destinationAccountName: beneficiary.accountName,
        destinationBankName: beneficiary.bankName,
        destinationRoutingNumber: beneficiary.routingNumber,
        destinationBankCode: beneficiary.bankCode,
        saveBeneficiary: false,
        metadata: {
          beneficiaryId: beneficiary.id,
          rail,
        },
      },
    };
  }

  private buildInitials(name: string | null): string | null {
    if (!name?.trim()) {
      return null;
    }

    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  }
}
