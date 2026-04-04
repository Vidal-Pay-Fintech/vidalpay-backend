import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { AbstractRepository } from 'src/database/abstract.repository';
import { Wallet } from '../entities/wallet.entity';
// import { API_MESSAGES } from 'src/utils/apiMessages';
// import {
//   PageOptionsDto,
//   ReportRange,
// } from 'src/common/pagination/pageOptionsDto.dto';

@Injectable()
export class WalletRepository extends AbstractRepository<Wallet> {
  protected readonly logger = new Logger(WalletRepository.name);

  constructor(
    @InjectRepository(Wallet)
    protected readonly walletEntityRepository: Repository<Wallet>,
  ) {
    super(walletEntityRepository);
  }

  private getWalletRepository(manager?: EntityManager): Repository<Wallet> {
    return manager?.getRepository(Wallet) ?? this.walletEntityRepository;
  }

  async findUserWallets(
    userId: string,
    manager?: EntityManager,
  ): Promise<Wallet[]> {
    const repository = this.getWalletRepository(manager);
    return repository.find({
      where: { userId, deletedAt: IsNull() as any },
      order: { createdAt: 'ASC' },
    });
  }

  async createWalletInTransaction(
    walletInfo: Partial<Wallet>,
    manager?: EntityManager,
  ): Promise<Wallet> {
    const repository = this.getWalletRepository(manager);
    const wallet = repository.create(walletInfo);
    return await repository.save(wallet);
  }

  async syncRoutingForUser(
    userId: string,
    routingPayload: Partial<Wallet>,
  ): Promise<void> {
    const wallets = await this.findUserWallets(userId);
    for (const wallet of wallets) {
      await this.findOneAndUpdate(wallet.id, routingPayload);
    }
  }
}
