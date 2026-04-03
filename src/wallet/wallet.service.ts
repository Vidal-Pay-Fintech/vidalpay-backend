import {
  BadRequestException,
  Injectable,
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

@Injectable()
export class WalletService {
  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly journalService: JournalService,
    private readonly userRepository: UserRepository,
    private readonly mailService: MailService,
    private readonly hashingService: HashingService,
    private readonly beneficiaryRepository: BeneficiaryRepository,
    private readonly userService: UserService,
  ) {}
  create(createWalletDto: CreateWalletDto) {
    return 'This action adds a new wallet';
  }

  async createCustomerWallets(userId: string) {
    console.log(`[AUTH] wallet creation start for user ${userId}`);

    try {
      const existingWallets = await this.walletRepository.findUserWallets(userId);
      const existingCurrencies = new Set(
        existingWallets.map((wallet) => wallet.currency),
      );

      for (const currency of [Currency.NGN, Currency.USD]) {
        if (existingCurrencies.has(currency)) {
          continue;
        }

        await this.walletRepository.create({
          userId,
          currency,
        });
        console.log(`[AUTH] wallet created for user ${userId}: ${currency}`);
      }

      return `Customer Wallet Created Succesfully`;
    } catch (error) {
      console.error(
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
      const user = await this.userRepository.findUserById(userId);
      const isPinValid = await this.hashingService.compare(pin, user.pin);

      if (!isPinValid) {
        throw new PreconditionFailedException(`Invalid transaction pin`);
      }

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
}
