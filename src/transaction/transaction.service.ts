import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TransactionRepository } from 'src/database/repositories/transaction.repository';
import { TransactionInterface } from 'src/vault/interface/transaction-interface';
import { WalletService } from 'src/wallet/wallet.service';
import { TransactionType } from 'src/utils/enums/transaction-type.enum';
import { WalletRepository } from 'src/database/repositories/wallet.repository';
import { Currency } from 'src/utils/enums/wallet.enum';
import { PageOptionsDto } from 'src/common/pagination/pageOptionsDto.dto';

@Injectable()
export class TransactionService {
  constructor(
    private readonly transactionRepository: TransactionRepository,
    // private readonly walletService: WalletService,
    private readonly walletRepository: WalletRepository,
  ) {}

  async debitUserWallet(userId: string, currency: Currency, amount: Number) {
    const walletDetails = await this.checkWalletBalance(
      userId,
      currency,
      amount,
    );
    const newBalance = Number(walletDetails.balance) - Number(amount);

    await this.walletRepository.findOneAndUpdate(walletDetails.id, {
      balance: newBalance,
    });
    return walletDetails;
  }

  async creditUserWallet(userId: string, currency: Currency, amount: Number) {
    const walletDetails = await this.getUserWalletByCurrencyandUserId(
      userId,
      currency,
    );
    const newBalance = Number(walletDetails.balance) + Number(amount);

    await this.walletRepository.findOneAndUpdate(walletDetails.id, {
      balance: newBalance,
    });
    return walletDetails;
  }

  public async debitTransaction(transactionDTO: TransactionInterface) {
    const { userId, amount, currency, info, description, reference, tag } =
      transactionDTO;

    const walletInfo = await this.getUserWalletByCurrencyandUserId(
      userId,
      currency,
    );
    const balanceBefore = walletInfo.balance;
    const balanceAfter = Number(walletInfo.balance) - amount;

    await this.debitUserWallet(userId, currency, amount);
    return this.transactionRepository.create({
      balanceBefore,
      balanceAfter,
      userId,
      amount,
      currency,
      info,
      type: TransactionType.DEBIT,
      description,
      reference,
      tag,
    });
  }

  public async creditTransaction(transactionDTO: TransactionInterface) {
    const { userId, amount, currency, info, description, reference, tag } =
      transactionDTO;

    const walletInfo = await this.getUserWalletByCurrencyandUserId(
      userId,
      currency,
    );
    const balanceBefore = walletInfo.balance;
    const balanceAfter = Number(walletInfo.balance) + amount;

    await this.creditUserWallet(userId, currency, amount);
    return this.transactionRepository.create({
      balanceBefore,
      balanceAfter,
      userId,
      amount,
      currency,
      info,
      type: TransactionType.CREDIT,
      description,
      reference,
      tag,
    });
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
  async getUserTransaction(userId: string, pageOptionsDto: PageOptionsDto) {
    const res = await this.transactionRepository.getUserTransactions(
      pageOptionsDto,
      userId,
    );
    return res;
  }
  create(createTransactionDto: CreateTransactionDto) {
    return 'This action adds a new transaction';
  }

  findAll() {
    return `This action returns all transaction`;
  }

  findOne(id: number) {
    return `This action returns a #${id} transaction`;
  }

  update(id: number, updateTransactionDto: UpdateTransactionDto) {
    return `This action updates a #${id} transaction`;
  }

  remove(id: number) {
    return `This action removes a #${id} transaction`;
  }
}
