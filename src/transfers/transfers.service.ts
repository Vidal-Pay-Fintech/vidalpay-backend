import { Injectable } from '@nestjs/common';
import { WalletService } from 'src/wallet/wallet.service';
import { InternalTransferDto } from 'src/wallet/dto/internal-transafer.dto';

@Injectable()
export class TransfersService {
  constructor(private readonly walletService: WalletService) {}

  async createInternalTransfer(userId: string, dto: InternalTransferDto) {
    return this.walletService.createInternalTransfer(dto, userId);
  }
}
