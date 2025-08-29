import { Injectable } from '@nestjs/common';
import { CreateJournalDto } from './dto/create-journal.dto';
import { UpdateJournalDto } from './dto/update-journal.dto';
import { TransactionService } from 'src/transaction/transaction.service';
import { VaultService } from 'src/vault/vault.service';
import { JournalInterface } from 'src/vault/interface/journal-interface';
import { UTILITIES } from 'src/utils/helperFuncs';
import { VaultType } from 'src/utils/enums/vault.enum';
import { Currency } from 'src/utils/enums/wallet.enum';
import { error } from 'console';

@Injectable()
export class JournalService {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly vaultService: VaultService,
  ) {}

  public async processWalletCreditJournal(
    journalInterfaceDTO: JournalInterface,
  ) {
    const { userId, currency, amount, info, description, tag, isReversal } =
      journalInterfaceDTO;

    const ref = UTILITIES.generateTransactionRef();
    const reference = isReversal ? `REV-${ref}` : ref;
    let vaultRes: any;
    let walletRes: any;
    const vaultType =
      currency === Currency.NGN ? VaultType.NGN_WALLET : VaultType.USD_WALLET;
    try {
      walletRes = await this.transactionService.creditTransaction({
        userId,
        currency,
        amount,
        info,
        description,
        tag,
        reference,
      });
      console.log('creditSuccesfulRes', walletRes);
      vaultRes = await this.vaultService.debitVault({
        userId,
        amount,
        currency,
        vaultType,
        description,
        reference,
      });
      return walletRes;
    } catch (err) {
      if (walletRes && !vaultRes) {
        walletRes = await this.transactionService.debitTransaction({
          userId,
          currency,
          amount,
          info,
          description,
          tag,
          reference: `REV-${reference}`,
        });
      }
      throw err;
    }
  }

  public async processWalletDebitJournal(
    journalInterfaceDTO: JournalInterface,
  ) {
    const { userId, currency, amount, info, description, tag, isReversal } =
      journalInterfaceDTO;
    const ref = UTILITIES.generateTransactionRef();
    const reference = isReversal ? `REV-${ref}` : ref;
    let vaultRes: any;
    let walletRes: any;
    const vaultType =
      currency === Currency.NGN ? VaultType.NGN_WALLET : VaultType.USD_WALLET;
    console.log(vaultType, reference);
    try {
      walletRes = await this.transactionService.debitTransaction({
        userId,
        currency,
        amount,
        info,
        description,
        tag,
        reference,
      });
      console.log('walletRes', walletRes);
      vaultRes = await this.vaultService.creditVault({
        userId,
        amount,
        currency,
        vaultType,
        description,
        reference,
      });
      return walletRes;
    } catch (err) {
      console.log('wallError', err);
      if (walletRes && !vaultRes) {
        walletRes = await this.transactionService.creditTransaction({
          userId,
          currency,
          amount,
          info,
          description,
          tag,
          reference: `REV-${reference}`,
        });
      }
      throw err;
    }
  }
  create(createJournalDto: CreateJournalDto) {
    return 'This action adds a new journal';
  }

  findAll() {
    return `This action returns all journal`;
  }

  findOne(id: number) {
    return `This action returns a #${id} journal`;
  }

  update(id: number, updateJournalDto: UpdateJournalDto) {
    return `This action updates a #${id} journal`;
  }

  remove(id: number) {
    return `This action removes a #${id} journal`;
  }
}
