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
import { User } from 'src/user/entities/user.entity';
import { MailService } from 'src/mail/mail.service';
import { HashingService } from 'src/iam/hashing/hashing.service';
// import { BeneficiaryRepository } from 'src/database/repositories/beneficiary.repository';

@Injectable()
export class WalletService {
  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly journalService: JournalService,
    private readonly userRepository: UserRepository,
    private readonly mailService: MailService,
    private readonly hashingService: HashingService,
    // private readonly beneficiaryRepository: BeneficiaryRepository,
  ) {}
  create(createWalletDto: CreateWalletDto) {
    return 'This action adds a new wallet';
  }

  async createCustomerWallets(userId: string) {
    await this.walletRepository.create({
      userId,
      currency: Currency.NGN,
    });
    await this.walletRepository.create({
      userId,
      currency: Currency.USD,
    });

    return `Customer Wallet Created Succesfully`;
  }

  async internalTransfer(
    internalTransferDTO: InternalTransferDto,
    userId: string,
  ) {
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
      // const beneficiary = await this.beneficiaryRepository.create({
      //   userId: recipientInfo.id,
      //   firstName: recipientInfo.firstName,
      //   lastName: recipientInfo.lastName,
      //   tagId: recipientInfo.tagId,
      //   email: recipientInfo.email,
      // });
      return userDebitRes;
      // {
      //   userDebitRes,
      //   beneficiary,
      // };
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
