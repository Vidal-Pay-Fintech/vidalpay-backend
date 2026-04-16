import { BadRequestException, Injectable } from '@nestjs/common';
import { PageOptionsDto } from 'src/common/pagination/pageOptionsDto.dto';
import { ProviderOperationRepository } from 'src/database/repositories/provider-operation.repository';
import { TransactionRepository } from 'src/database/repositories/transaction.repository';
import { WalletRepository } from 'src/database/repositories/wallet.repository';
import { TransactionInterface } from 'src/vault/interface/transaction-interface';
import { Currency } from 'src/utils/enums/wallet.enum';
import { TransactionType } from 'src/utils/enums/transaction-type.enum';

@Injectable()
export class TransactionService {
  constructor(
    private readonly transactionRepository: TransactionRepository,
    private readonly walletRepository: WalletRepository,
    private readonly providerOperationRepository: ProviderOperationRepository,
  ) {}

  async debitUserWallet(userId: string, currency: Currency, amount: Number) {
    const walletDetails = await this.checkWalletBalance(userId, currency, amount);
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
    return this.transactionRepository.getUserTransactions(pageOptionsDto, userId);
  }

  async getUserTransactionDetail(userId: string, id: string) {
    const transaction = await this.transactionRepository.findUserTransactionById(
      userId,
      id,
    );
    const receipt = await this.buildReceipt(transaction);

    return {
      transaction,
      receipt,
    };
  }

  async getUserTransactionReceipt(userId: string, id: string) {
    const transaction = await this.transactionRepository.findUserTransactionById(
      userId,
      id,
    );

    return this.buildReceipt(transaction);
  }

  async getUserStatement(userId: string, pageOptionsDto: PageOptionsDto) {
    const statement = await this.transactionRepository.getUserTransactions(
      {
        ...pageOptionsDto,
        isExport: undefined,
      } as PageOptionsDto,
      userId,
    );

    const items = Array.isArray(statement) ? statement : statement.data;
    const totals = items.reduce(
      (accumulator, item) => {
        if (item.type === TransactionType.CREDIT) {
          accumulator.inflow[item.currency] =
            (accumulator.inflow[item.currency] ?? 0) + Number(item.amount);
        } else {
          accumulator.outflow[item.currency] =
            (accumulator.outflow[item.currency] ?? 0) + Number(item.amount);
        }

        return accumulator;
      },
      {
        inflow: {} as Record<string, number>,
        outflow: {} as Record<string, number>,
      },
    );

    return {
      period: {
        from: pageOptionsDto.from || null,
        to: pageOptionsDto.to || null,
      },
      totals,
      transactions: items,
      meta: Array.isArray(statement) ? null : statement.meta,
      export: {
        availableFormats: ['JSON'],
        message: 'Statement export is available through the API response in staging.',
      },
    };
  }

  create() {
    return null;
  }

  findAll() {
    return [];
  }

  findOne() {
    return null;
  }

  update() {
    return null;
  }

  remove() {
    return null;
  }

  private async buildReceipt(transaction: any) {
    const providerOperation = transaction.reference
      ? await this.providerOperationRepository.findByReference(transaction.reference)
      : null;

    return {
      id: transaction.id,
      reference: transaction.reference,
      type: transaction.type,
      tag: transaction.tag,
      currency: transaction.currency,
      amount: transaction.amount,
      balanceBefore: transaction.balanceBefore,
      balanceAfter: transaction.balanceAfter,
      status:
        providerOperation?.status ??
        (transaction.type === TransactionType.DEBIT ? 'COMPLETED' : 'COMPLETED'),
      title: transaction.info,
      description: transaction.description,
      provider: providerOperation?.provider ?? null,
      providerReference: providerOperation?.externalReference ?? null,
      createdAt: transaction.createdAt,
      share: {
        title: `VidalPay ${transaction.tag} receipt`,
        message: `${transaction.info} | ${transaction.currency} ${transaction.amount} | Ref: ${transaction.reference}`,
        fields: [
          { label: 'Reference', value: transaction.reference },
          { label: 'Amount', value: `${transaction.currency} ${transaction.amount}` },
          { label: 'Description', value: transaction.description ?? transaction.info },
        ],
      },
    };
  }
}
