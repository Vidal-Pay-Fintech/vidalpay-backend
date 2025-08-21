import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { WalletRepository } from 'src/database/repositories/wallet.repository';
import { Currency } from 'src/utils/enums/wallet.enum';
import { throwError } from 'rxjs';
import { error } from 'console';

@Injectable()
export class WalletService {
  constructor(private readonly walletRepository: WalletRepository) {}
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

  async getUserWalletByCurrencyandUserId(userId: string, currency: Currency) {
    const res = await this.walletRepository.findOne({
      where: { userId, currency },
    });

    if (!res) {
      throw new BadRequestException('Wallet not found');
    }

    return res;
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
    const walletDetails = await this.checkWalletBalance(
      userId,
      currency,
      amount,
    );
    const newBalance = Number(walletDetails.balance) + Number(amount);

    await this.walletRepository.findOneAndUpdate(walletDetails.id, {
      balance: newBalance,
    });
    return walletDetails;
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
