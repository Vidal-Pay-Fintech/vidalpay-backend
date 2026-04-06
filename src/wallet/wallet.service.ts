import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  PreconditionFailedException,
} from '@nestjs/common';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { WalletRepository } from 'src/database/repositories/wallet.repository';
import { Currency } from 'src/utils/enums/wallet.enum';
import { InternalTransferDto } from './dto/internal-transafer.dto';
import { JournalService } from 'src/journal/journal.service';
import { UserRepository } from 'src/database/repositories/user.repository';
import { TagType } from 'src/utils/enums/tag.enum';
import { MailService } from 'src/mail/mail.service';
import { HashingService } from 'src/iam/hashing/hashing.service';
import { BeneficiaryRepository } from 'src/database/repositories/beneficiary.repository';
import { ExchangeDto } from './dto/exchange.dto';
import { APICall } from 'src/utils/apiCall';
import { APIType } from 'src/common/enum/api-type.dto';
import { UTILITIES } from 'src/utils/helperFuncs';
import { UserService } from 'src/user/user.service';
import { EntityManager } from 'typeorm';
import { Wallet } from 'src/database/entities/wallet.entity';
import { ProviderOperationsService } from 'src/integrations/provider/provider-operations.service';
import { ExternalTransferDto } from './dto/external-transfer.dto';
import { AirtimePurchaseDto } from './dto/airtime-purchase.dto';
import { DataPurchaseDto } from './dto/data-purchase.dto';
import { UtilityPaymentDto } from './dto/utility-payment.dto';
import {
  ProviderOperationStatus,
  ProviderOperationType,
} from 'src/common/enum/provider-operation.enum';
import { SupportedRegion } from 'src/common/enum/supported-region.enum';
import { API_MESSAGES } from 'src/utils/apiMessages';
import { ProviderOperationRepository } from 'src/database/repositories/provider-operation.repository';
import { CreateCardTopUpIntentDto } from './dto/create-card-topup-intent.dto';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly journalService: JournalService,
    private readonly userRepository: UserRepository,
    private readonly mailService: MailService,
    private readonly hashingService: HashingService,
    private readonly beneficiaryRepository: BeneficiaryRepository,
    private readonly userService: UserService,
    private readonly providerOperationsService: ProviderOperationsService,
    private readonly providerOperationRepository: ProviderOperationRepository,
  ) {}
  create(createWalletDto: CreateWalletDto) {
    return 'This action adds a new wallet';
  }

  async createCustomerWallets(
    userId: string,
    manager?: EntityManager,
  ): Promise<Wallet[]> {
    this.logger.log(`[AUTH] wallet creation start for user ${userId}`);

    try {
      const existingWallets = await this.walletRepository.findUserWallets(
        userId,
        manager,
      );
      const existingCurrencies = new Set(
        existingWallets.map((wallet) => wallet.currency),
      );
      const createdCurrencies: Currency[] = [];

      for (const currency of [Currency.NGN, Currency.USD]) {
        if (existingCurrencies.has(currency)) {
          continue;
        }

        await this.walletRepository.createWalletInTransaction(
          {
            userId,
            currency,
          },
          manager,
        );
        createdCurrencies.push(currency);
        this.logger.log(`[AUTH] wallet created for user ${userId}: ${currency}`);
      }

      const finalWallets = await this.walletRepository.findUserWallets(
        userId,
        manager,
      );
      const finalCurrencies = new Set(finalWallets.map((wallet) => wallet.currency));

      if (
        !finalCurrencies.has(Currency.NGN) ||
        !finalCurrencies.has(Currency.USD)
      ) {
        throw new ConflictException(
          'Customer wallet setup could not be completed.',
        );
      }

      this.logger.log(
        `[AUTH] wallet creation completed for user ${userId}. created=${createdCurrencies.join(',') || 'none'} total=${finalWallets.length}`,
      );

      return finalWallets;
    } catch (error) {
      this.logger.error(
        `[AUTH] wallet creation failed for user ${userId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async internalTransfer(
    internalTransferDTO: InternalTransferDto,
    userId: string,
  ) {
    await this.userService.ensureCanTransfer(userId);

    const { amount, recipientTag, currency, pin } = internalTransferDTO;
    const recipientInfo = await this.userRepository.findUserByTag(recipientTag);
    const userInfo = await this.userRepository.findUserById(userId);

    let userDebitRes: any;
    let recipientCreditRes: any;
    const info = `Sent to @${recipientInfo.firstName} ${recipientInfo.lastName}`;
    const description = `Internal transfer from ${userInfo.firstName} ${userInfo.lastName} to ${recipientTag}`;
    try {
      await this.assertTransactionPinAuthorized(userId, pin);

      userDebitRes = await this.journalService.processWalletDebitJournal({
        userId,
        amount,
        info,
        description,
        currency,
        tag: TagType.TAGBASED,
      });

      recipientCreditRes = await this.journalService.processWalletCreditJournal(
        {
          userId: recipientInfo.id,
          amount,
          info: `Received from @${userInfo.tagId}`,
          description,
          currency,
          tag: TagType.TAGBASED,
        },
      );

      //beneficiary service.addtobeneficiary
      //emailservice
      // await this.mailService.sendTransactionMail(
      //   userInfo.id,
      //   amount,
      //   info,
      //   currency,
      // );

      const findBeneficiary = await this.beneficiaryRepository.findOne({
        where: {
          beneficiaryId: recipientInfo.id,
        },
      });

      const beneficiaryEixt =
        findBeneficiary?.beneficiaryId == recipientInfo.id;

      // console.log('beneficiaryEixt', beneficiaryEixt);
      // console.log('beneficiaryId', findBeneficiary?.beneficiaryId);
      // console.log('recipientInfo', recipientInfo.id);
      // if (!beneficiaryEixt) {
      await this.beneficiaryRepository.create({
        beneficiaryId: recipientInfo.id,
        senderId: userInfo.id,
      });
      // }
      // const beneficiaryres = await this.beneficiaryRepository.create({
      //   beneficiaryId: recipientInfo.id,
      //   senderId: userInfo.id,
      // });

      return userDebitRes;
    } catch (err) {
      if (userDebitRes && !recipientCreditRes) {
        userDebitRes = await this.journalService.processWalletCreditJournal({
          userId,
          amount,
          info,
          description: `REV-${description}`,
          currency,
          tag: TagType.TAGBASED,
          isReversal: true,
        });
      }
      throw err;
    }
  }

  // async internalTransfer(
  //   internalTransferDTO: InternalTransferDto,
  //   userId: string,
  // ) {
  //   const { amount, recipientTag, currency, pin } = internalTransferDTO;
  //   const recipientInfo = await this.userRepository.findUserByTag(recipientTag);
  //   const userInfo = await this.userRepository.findUserById(userId);

  //   let userDebitRes: any;
  //   let recipientCreditRes: any;
  //   const info = `Sent to @${recipientInfo.firstName} ${recipientInfo.lastName}`;
  //   const description = `Internal transfer from ${userInfo.firstName} ${userInfo.lastName} to ${recipientTag}`;

  //   try {
  //     const user = await this.userRepository.findUserById(userId);
  //     const isPinValid = await this.hashingService.compare(pin, user.pin);

  //     if (!isPinValid) {
  //       throw new PreconditionFailedException(`Invalid transaction pin`);
  //     }

  //     userDebitRes = await this.journalService.processWalletDebitJournal({
  //       userId,
  //       amount,
  //       info,
  //       description,
  //       currency,
  //       tag: TagType.TAGBASED,
  //     });

  //     recipientCreditRes = await this.journalService.processWalletCreditJournal(
  //       {
  //         userId: recipientInfo.id,
  //         amount,
  //         info: `Received from @${userInfo.tagId}`,
  //         description,
  //         currency,
  //         tag: TagType.TAGBASED,
  //       },
  //     );

  //     // Check if beneficiary relationship already exists
  //     const findBeneficiary = await this.beneficiaryRepository.findOne({
  //       where: {
  //         beneficiaryId: recipientInfo.id,
  //         senderId: userInfo.id, // Add this condition to check the specific relationship
  //       },
  //     });

  //     // Simply check if the record exists
  //     if (!findBeneficiary) {
  //       await this.beneficiaryRepository.create({
  //         beneficiaryId: recipientInfo.id,
  //         senderId: userInfo.id,
  //       });
  //       console.log('New beneficiary created');
  //     } else {
  //       console.log('Beneficiary already exists, skipping creation');
  //     }

  //     return userDebitRes;
  //   } catch (err) {
  //     if (userDebitRes && !recipientCreditRes) {
  //       userDebitRes = await this.journalService.processWalletCreditJournal({
  //         userId,
  //         amount,
  //         info,
  //         description: `REV-${description}`,
  //         currency,
  //         tag: TagType.TAGBASED,
  //         isReversal: true,
  //       });
  //     }
  //     throw err;
  //   }
  // }

  async internalExchange(exchageDto: ExchangeDto, userId: string) {
    const { fromCurrency, toCurrency, amount } = exchageDto;

    const fee = UTILITIES.getPercentageAmount(amount, 1);
    const amountToCharge = amount + Number(fee);
    await this.checkWalletBalance(userId, fromCurrency, amountToCharge);

    const exchangeRate = await this.getExchangeRate(fromCurrency, toCurrency);
    const amountToCredit = amount * exchangeRate;

    let debitRes: any;
    let creditRes: any;
    let chargeRes: any;

    try {
      debitRes = await this.journalService.processWalletDebitJournal({
        userId,
        amount,
        info: `Currency Exchange from ${fromCurrency} to ${toCurrency}`,
        description: `Internal Exchange from ${fromCurrency} to ${toCurrency}`,
        currency: fromCurrency,
        tag: TagType.EXCHANGE,
      });

      chargeRes = await this.journalService.processCreditChargesJournal({
        userId,
        amount: fee,
        info: `Exchanges charges fee  ${fromCurrency} to ${toCurrency}`,
        description: `Internal charges fee ${fromCurrency} to ${toCurrency}`,
        currency: fromCurrency,
        tag: TagType.EXCHANGE,
      });

      creditRes = await this.journalService.processWalletCreditJournal({
        userId,
        amount: amountToCredit,
        info: `Currency Exchange  ${fromCurrency} to ${toCurrency}`,
        description: `Internal Exchange from ${fromCurrency} to ${toCurrency}`,
        currency: toCurrency,
        tag: TagType.EXCHANGE,
      });

      return creditRes;
    } catch (error) {
      if (debitRes && !creditRes) {
        debitRes = await this.journalService.processWalletCreditJournal({
          userId,
          amount,
          info: `reverse`,
          description: `REV-`,
          currency: fromCurrency,
          tag: TagType.EXCHANGE,
          isReversal: true,
        });
        if (chargeRes) {
          chargeRes = await this.journalService.processCreditChargesJournal({
            userId,
            amount: fee,
            info: `reverse`,
            description: `REV-`,
            currency: fromCurrency,
            tag: TagType.EXCHANGE,
            isReversal: true,
          });
        }
      }
      throw error;
    }
  }

  public async getExchangeRate(
    fromCurrency: Currency,
    toCurrency: Currency,
  ): Promise<number> {
    try {
      const headers = {
        'Content-Type': 'application/json',
      };
      console.log('fromto', fromCurrency, toCurrency);
      const response = await APICall.sendRequest(
        `https://api.exchangerate-api.com/v4/latest/${fromCurrency}`,
        APIType.GET,
        headers,
      );
      console.log('REATEres', response);
      console.log('RESPONSERATEEEE', response?.rates);

      if (!response || !response.rates) {
        throw new Error('Invalid response from exchange rate API');
      }

      const rate = response.rates[toCurrency];
      console.log('MYRATEOOOO', rate);

      if (!rate) {
        throw new Error(`No rate found for ${toCurrency} in API response`);
      }

      return parseFloat(rate);
    } catch (error) {
      throw error;
    }
  }

  async checkWalletBalance(userId: string, currency: Currency, amount: Number) {
    const walletInfo = await this.getUserWalletByCurrencyandUserId(
      userId,
      currency,
    );
    if (Number(walletInfo.balance) < Number(amount)) {
      throw new BadRequestException(
        `Insufficient Balance in your ${walletInfo.currency} wallet `,
      );
    }
    return walletInfo;
  }

  async externalTransfer(externalTransferDto: ExternalTransferDto, userId: string) {
    const capabilities = await this.userService.ensureCanTransfer(userId);
    await this.assertTransactionPinAuthorized(userId, externalTransferDto.pin);

    if (!capabilities.region) {
      throw new PreconditionFailedException(
        capabilities.blockedReason ?? API_MESSAGES.KYC_REGION_REQUIRED,
      );
    }
    const region = capabilities.region;

    const user = await this.userRepository.getUserById(userId);
    const wallet = await this.checkWalletBalance(
      userId,
      externalTransferDto.currency,
      externalTransferDto.amount,
    );

    return this.executeDebitedProviderOperation({
      userId,
      amount: externalTransferDto.amount,
      currency: externalTransferDto.currency,
      tag: TagType.WITHDRAWAL,
      info: `External transfer to ${externalTransferDto.destinationAccountNumber}`,
      description:
        externalTransferDto.narration?.trim() ||
        `External transfer to ${externalTransferDto.destinationAccountNumber}`,
      operationLabel: 'External transfer',
      createOperation: () =>
        this.providerOperationsService.createExternalTransfer({
          user,
          region,
          wallet,
          amount: externalTransferDto.amount,
          currency: externalTransferDto.currency,
          destinationAccountNumber: externalTransferDto.destinationAccountNumber,
          destinationAccountName:
            externalTransferDto.destinationAccountName ?? null,
          destinationBankName: externalTransferDto.destinationBankName ?? null,
          destinationRoutingNumber:
            externalTransferDto.destinationRoutingNumber ?? null,
          narration: externalTransferDto.narration ?? null,
          metadata: externalTransferDto.metadata ?? null,
        }),
    });
  }

  async purchaseAirtime(airtimePurchaseDto: AirtimePurchaseDto, userId: string) {
    return this.processRegionalProductOperation(
      ProviderOperationType.AIRTIME,
      airtimePurchaseDto.currency,
      airtimePurchaseDto.amount,
      userId,
      {
        phoneNumber: airtimePurchaseDto.phoneNumber,
        pin: airtimePurchaseDto.pin,
        metadata: airtimePurchaseDto.metadata ?? null,
      },
    );
  }

  async purchaseData(dataPurchaseDto: DataPurchaseDto, userId: string) {
    return this.processRegionalProductOperation(
      ProviderOperationType.DATA,
      dataPurchaseDto.currency,
      dataPurchaseDto.amount,
      userId,
      {
        phoneNumber: dataPurchaseDto.phoneNumber,
        pin: dataPurchaseDto.pin,
        serviceCode: dataPurchaseDto.serviceCode,
        metadata: dataPurchaseDto.metadata ?? null,
      },
    );
  }

  async payUtility(utilityPaymentDto: UtilityPaymentDto, userId: string) {
    return this.processRegionalProductOperation(
      ProviderOperationType.UTILITY,
      utilityPaymentDto.currency,
      utilityPaymentDto.amount,
      userId,
      {
        serviceCode: utilityPaymentDto.serviceCode,
        customerReference: utilityPaymentDto.customerReference,
        pin: utilityPaymentDto.pin,
        metadata: utilityPaymentDto.metadata ?? null,
      },
    );
  }

  async createCardTopUpIntent(
    createCardTopUpIntentDto: CreateCardTopUpIntentDto,
    userId: string,
  ) {
    const accountOverview = await this.userService.getAccountOverview(userId);
    const region = accountOverview.region;

    if (!region) {
      throw new BadRequestException(API_MESSAGES.KYC_REGION_REQUIRED);
    }

    if (!accountOverview.productAvailability.cardTopUp) {
      throw new BadRequestException(API_MESSAGES.CARD_TOPUP_UNAVAILABLE);
    }

    const user = await this.userRepository.getUserById(userId);
    const wallet = await this.getUserWalletByCurrencyandUserId(
      userId,
      createCardTopUpIntentDto.currency,
    );

    return this.providerOperationsService.createCardTopUpIntent({
      user,
      region,
      wallet,
      amount: createCardTopUpIntentDto.amount,
      currency: createCardTopUpIntentDto.currency,
      redirectUrl: createCardTopUpIntentDto.redirectUrl ?? null,
      metadata: createCardTopUpIntentDto.metadata ?? null,
    });
  }

  async getUserWalletByCurrencyandUserId(userId: string, currency: Currency) {
    const res = await this.walletRepository.findOne({
      where: { userId, currency },
    });

    if (!res) {
      throw new BadRequestException('Wallet not found');
    }

    return res;
  }

  findAll() {
    return `This action returns all wallet`;
  }

  findOne(id: number) {
    return `This action returns a #${id} wallet`;
  }

  update(id: number, updateWalletDto: UpdateWalletDto) {
    return `This action updates a #${id} wallet`;
  }

  remove(id: number) {
    return `This action removes a #${id} wallet`;
  }

  private async processRegionalProductOperation(
    operationType:
      | ProviderOperationType.AIRTIME
      | ProviderOperationType.DATA
      | ProviderOperationType.UTILITY,
    currency: Currency,
    amount: number,
    userId: string,
    payload: {
      phoneNumber?: string | null;
      pin: string;
      serviceCode?: string | null;
      customerReference?: string | null;
      metadata?: Record<string, any> | null;
    },
  ) {
    const accountOverview = await this.userService.getAccountOverview(userId);
    const region = accountOverview.region;
    const productAvailability = accountOverview.productAvailability;
    const user = await this.userRepository.getUserById(userId);
    await this.assertTransactionPinAuthorized(userId, payload.pin);
    const wallet = await this.checkWalletBalance(userId, currency, amount);

    if (!region) {
      throw new BadRequestException(API_MESSAGES.KYC_REGION_REQUIRED);
    }

    if (
      (operationType === ProviderOperationType.AIRTIME &&
        !productAvailability.airtime) ||
      (operationType === ProviderOperationType.DATA && !productAvailability.data) ||
      (operationType === ProviderOperationType.UTILITY &&
        !productAvailability.utilities)
    ) {
      throw new BadRequestException(API_MESSAGES.PRODUCT_NOT_AVAILABLE_FOR_REGION);
    }

    const operationLabel =
      operationType === ProviderOperationType.AIRTIME
        ? 'Airtime purchase'
        : operationType === ProviderOperationType.DATA
          ? 'Data purchase'
          : 'Utility payment';

    const operationInfo =
      operationType === ProviderOperationType.AIRTIME
        ? `Airtime purchase for ${payload.phoneNumber ?? 'line'}`
        : operationType === ProviderOperationType.DATA
          ? `Data purchase for ${payload.phoneNumber ?? 'line'}`
          : `Utility payment for ${payload.customerReference ?? 'account'}`;

    const operationDescription =
      operationType === ProviderOperationType.AIRTIME
        ? `Airtime purchase (${payload.phoneNumber ?? 'line'})`
        : operationType === ProviderOperationType.DATA
          ? `Data purchase (${payload.serviceCode ?? 'bundle'})`
          : `Utility payment (${payload.serviceCode ?? 'service'})`;

    return this.executeDebitedProviderOperation({
      userId,
      amount,
      currency,
      tag: TagType.BILLS,
      info: operationInfo,
      description: operationDescription,
      operationLabel,
      createOperation: () =>
        this.providerOperationsService.createRegionalProductOperation({
          operationType,
          user,
          region,
          payload: {
            user,
            wallet,
            amount,
            currency,
            phoneNumber: payload.phoneNumber ?? null,
            serviceCode: payload.serviceCode ?? null,
            customerReference: payload.customerReference ?? null,
            metadata: payload.metadata ?? null,
          },
        }),
    });
  }

  private async executeDebitedProviderOperation(input: {
    userId: string;
    amount: number;
    currency: Currency;
    tag: TagType;
    info: string;
    description: string;
    operationLabel: string;
    createOperation: () => Promise<{
      provider: any;
      region: SupportedRegion;
      status: ProviderOperationStatus;
      reference: string;
      externalReference?: string | null;
    }>;
  }) {
    let walletDebitTransaction: any;
    let walletDebitReversed = false;

    try {
      walletDebitTransaction =
        await this.journalService.processWalletDebitJournal({
          userId: input.userId,
          amount: input.amount,
          info: input.info,
          description: input.description,
          currency: input.currency,
          tag: input.tag,
        });

      const providerOperation = await input.createOperation();

      await this.attachOperationLedgerMetadata(providerOperation.reference, {
        walletDebitTransactionReference:
          walletDebitTransaction?.reference ?? null,
        walletDebitTransactionId: walletDebitTransaction?.id ?? null,
        walletDebitedAt: new Date().toISOString(),
      });

      if (
        providerOperation.status === ProviderOperationStatus.FAILED ||
        providerOperation.status === ProviderOperationStatus.REVERSED
      ) {
        const reversalTransaction = await this.reverseDebitedProviderOperation({
          userId: input.userId,
          amount: input.amount,
          currency: input.currency,
          tag: input.tag,
          info: `Reversal for ${input.info}`,
          description: `REV-${input.description}`,
        });

        await this.attachOperationLedgerMetadata(providerOperation.reference, {
          walletDebitReversalReference: reversalTransaction?.reference ?? null,
          walletDebitReversalId: reversalTransaction?.id ?? null,
          walletReversedAt: new Date().toISOString(),
        });
        walletDebitReversed = true;

        throw new ConflictException(
          `${input.operationLabel} could not be initiated. Wallet funds have been reversed.`,
        );
      }

      return {
        ...providerOperation,
        walletDebited: true,
        walletTransactionReference: walletDebitTransaction?.reference ?? null,
      };
    } catch (error) {
      if (walletDebitTransaction && !walletDebitReversed) {
        const reversalTransaction = await this.reverseDebitedProviderOperation({
          userId: input.userId,
          amount: input.amount,
          currency: input.currency,
          tag: input.tag,
          info: `Reversal for ${input.info}`,
          description: `REV-${input.description}`,
        });

        await this.attachOperationLedgerMetadata(
          this.extractProviderReference(error),
          {
            walletDebitReversalReference: reversalTransaction?.reference ?? null,
            walletDebitReversalId: reversalTransaction?.id ?? null,
            walletReversedAt: new Date().toISOString(),
            walletReversalReason: error?.message ?? 'provider-initiation-failed',
          },
        );
      }

      throw error;
    }
  }

  private async reverseDebitedProviderOperation(input: {
    userId: string;
    amount: number;
    currency: Currency;
    tag: TagType;
    info: string;
    description: string;
  }) {
    return this.journalService.processWalletCreditJournal({
      userId: input.userId,
      amount: input.amount,
      info: input.info,
      description: input.description,
      currency: input.currency,
      tag: input.tag,
      isReversal: true,
    });
  }

  private async attachOperationLedgerMetadata(
    operationReference: string | null | undefined,
    metadataPatch: Record<string, any>,
  ) {
    if (!operationReference) {
      return;
    }

    try {
      const operation =
        await this.providerOperationRepository.findByReference(operationReference);
      if (!operation) {
        return;
      }

      await this.providerOperationRepository.findOneAndUpdate(operation.id, {
        metadata: {
          ...(operation.metadata ?? {}),
          ...metadataPatch,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Unable to annotate provider operation ${operationReference}: ${error.message}`,
      );
    }
  }

  private extractProviderReference(error: unknown): string | null {
    if (!error || typeof error !== 'object') {
      return null;
    }

    const maybeError = error as {
      response?: { reference?: string | null };
      reference?: string | null;
    };

    return maybeError.reference ?? maybeError.response?.reference ?? null;
  }

  private async assertTransactionPinAuthorized(userId: string, pin: string) {
    const user = await this.userRepository.findUserById(userId);
    const storedPin = user.pin?.trim();

    if (!storedPin) {
      throw new PreconditionFailedException(API_MESSAGES.TRANSFER_PIN_REQUIRED);
    }

    const isPinValid = await this.hashingService.compare(pin, storedPin);
    if (!isPinValid) {
      throw new PreconditionFailedException(`Invalid transaction pin`);
    }

    return true;
  }
}
