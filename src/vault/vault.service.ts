import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { CreateVaultDto } from './dto/create-vault.dto';
import { UpdateVaultDto } from './dto/update-vault.dto';
import { VaultRepository } from 'src/database/repositories/vault.repository';
import { VaultJournalRepository } from 'src/database/repositories/vault-journal.repository';
import { VaultType } from 'src/utils/enums/vault.enum';
import { VaultInterface } from './interface/debit-vault-interface';
import { TransactionType } from 'src/utils/enums/transaction-type.enum';

@Injectable()
export class VaultService {
  constructor(
    private readonly vaultRepository: VaultRepository,
    private readonly vaultJournalRepository: VaultJournalRepository,
  ) {}

  private async getVaultByVaultType(vaultType: VaultType) {
    const res = await this.vaultRepository.findOne({
      where: { vaultType },
    });
    if (!res) {
      throw new UnprocessableEntityException('Vault type not found');
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
    const totalCredit = Number(vaultInfo.totalCredit) - amount;
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
    return 'This action adds a new vault';
  }

  findAll() {
    return `This action returns all vault`;
  }

  findOne(id: number) {
    return `This action returns a #${id} vault`;
  }

  update(id: number, updateVaultDto: UpdateVaultDto) {
    return `This action updates a #${id} vault`;
  }

  remove(id: number) {
    return `This action removes a #${id} vault`;
  }
}
