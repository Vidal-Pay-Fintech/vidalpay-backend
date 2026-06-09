import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { CreateVaultDto } from './dto/create-vault.dto';
import { UpdateVaultDto } from './dto/update-vault.dto';
import { VaultRepository } from 'src/database/repositories/vault.repository';
import { VaultJournalRepository } from 'src/database/repositories/vault-journal.repository';
import { VaultType } from 'src/utils/enums/vault.enum';
import { VaultInterface } from './interface/debit-vault-interface';
import { TransactionType } from 'src/utils/enums/transaction-type.enum';

@Injectable()
export class VaultService {
  private readonly logger = new Logger(VaultService.name);

  constructor(
    private readonly vaultRepository: VaultRepository,
    private readonly vaultJournalRepository: VaultJournalRepository,
  ) {}

  private async getVaultByVaultType(vaultType: VaultType) {
    const res = await this.vaultRepository.findOne({
      where: { vaultType },
    });
    if (!res) {
      this.logger.warn(
        `Vault type ${vaultType} was missing. Creating demo-safe vault.`,
      );
      return this.vaultRepository.create({
        vaultName: vaultType,
        vaultType,
        totalDebit: 0,
        totalCredit: 0,
        workingBalance: 0,
      });
    }
    return res;
  }

  public async debitVault(debitVaultInterfaceDTO: VaultInterface) {
    const { userId, amount, currency, vaultType, description, reference } =
      debitVaultInterfaceDTO;
    const vaultInfo = await this.getVaultByVaultType(vaultType);
    const currentBalance = vaultInfo.workingBalance;
    const totalDebit = Number(vaultInfo.totalDebit) + amount;
    const balanceLeft = Number(currentBalance) - amount;
    await this.vaultRepository.findOneAndUpdate(vaultInfo.id, {
      totalDebit,
      workingBalance: balanceLeft,
    });

    return await this.vaultJournalRepository.create({
      userId,
      currency,
      amount,
      description,
      vaultType,
      reference,
      transactionType: TransactionType.DEBIT,
      balanceBefore: currentBalance,
      balanceAfter: balanceLeft,
    });
  }

  public async creditVault(VaultInterfaceDTO: VaultInterface) {
    const { userId, amount, currency, vaultType, description, reference } =
      VaultInterfaceDTO;
    const vaultInfo = await this.getVaultByVaultType(vaultType);
    const currentBalance = vaultInfo.workingBalance;
    const totalCredit = Number(vaultInfo.totalCredit) + amount;
    const balanceLeft = Number(currentBalance) + amount;
    await this.vaultRepository.findOneAndUpdate(vaultInfo.id, {
      totalCredit,
      workingBalance: balanceLeft,
    });

    return await this.vaultJournalRepository.create({
      userId,
      currency,
      amount,
      description,
      vaultType,
      reference,
      transactionType: TransactionType.CREDIT,
      balanceBefore: currentBalance,
      balanceAfter: balanceLeft,
    });
  }

  create(createVaultDto: CreateVaultDto) {
    throw new NotImplementedException(
      'Vault scaffold route is disabled. Vault writes are internal ledger operations only.',
    );
  }

  findAll() {
    throw new NotImplementedException(
      'Vault scaffold route is disabled. Vault reads require admin reconciliation APIs.',
    );
  }

  findOne(id: number) {
    throw new NotImplementedException(
      'Vault scaffold route is disabled. Vault reads require admin reconciliation APIs.',
    );
  }

  update(id: number, updateVaultDto: UpdateVaultDto) {
    throw new NotImplementedException(
      'Vault scaffold route is disabled. Vault updates are not public product APIs.',
    );
  }

  remove(id: number) {
    throw new NotImplementedException(
      'Vault scaffold route is disabled. Vault deletion is not a public product API.',
    );
  }
}
