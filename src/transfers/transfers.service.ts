import { Injectable } from '@nestjs/common';
import { PageOptionsDto } from 'src/common/pagination/pageOptionsDto.dto';
import { BeneficiaryService } from 'src/beneficiary/beneficiary.service';
import { TransactionService } from 'src/transaction/transaction.service';
import { WalletService } from 'src/wallet/wallet.service';
import { InternalTransferDto } from 'src/wallet/dto/internal-transafer.dto';

@Injectable()
export class TransfersService {
  constructor(
    private readonly walletService: WalletService,
    private readonly transactionService: TransactionService,
    private readonly beneficiaryService: BeneficiaryService,
  ) {}

  async createInternalTransfer(userId: string, dto: InternalTransferDto) {
    const transaction = await this.walletService.internalTransfer(dto, userId);
    const receipt = transaction?.id
      ? await this.transactionService.getUserTransactionReceipt(
          userId,
          transaction.id,
        )
      : null;
    const recipients =
      await this.beneficiaryService.getBeneficiaryForSingleUser(
        {
          page: 1,
          limit: 10,
          isExport: '',
        } as PageOptionsDto,
        userId,
      );

    return {
      status: 'SUCCESS',
      transfer: transaction,
      receipt,
      recentRecipients: Array.isArray(recipients)
        ? recipients
        : recipients.beneficiaries,
      savedBeneficiaries: Array.isArray(recipients)
        ? recipients
        : recipients.beneficiaries,
      audit: {
        event: 'INTERNAL_TRANSFER_COMPLETED',
        reference: transaction?.reference ?? null,
        timestamp: new Date().toISOString(),
      },
    };
  }
}
