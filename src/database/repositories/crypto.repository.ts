import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { CryptoAccount } from '../entities/crypto-account.entity';
import { CryptoBalance } from '../entities/crypto-balance.entity';
import { CryptoOrder } from '../entities/crypto-order.entity';
import { CryptoStakingPosition } from '../entities/crypto-staking-position.entity';
import { CryptoTransfer } from '../entities/crypto-transfer.entity';
import { CryptoDepositAddress } from '../entities/crypto-deposit-address.entity';

@Injectable()
export class CryptoRepository {
  constructor(
    @InjectRepository(CryptoAccount)
    private readonly accounts: Repository<CryptoAccount>,
    @InjectRepository(CryptoBalance)
    private readonly balances: Repository<CryptoBalance>,
    @InjectRepository(CryptoOrder)
    private readonly orders: Repository<CryptoOrder>,
    @InjectRepository(CryptoTransfer)
    private readonly transfers: Repository<CryptoTransfer>,
    @InjectRepository(CryptoStakingPosition)
    private readonly stakingPositions: Repository<CryptoStakingPosition>,
    @InjectRepository(CryptoDepositAddress)
    private readonly depositAddresses: Repository<CryptoDepositAddress>,
  ) {}

  findAccount(userId: string) {
    return this.accounts.findOne({ where: { userId } });
  }

  createAccount(input: DeepPartial<CryptoAccount>) {
    return this.accounts.save(this.accounts.create(input));
  }

  updateAccount(id: string, input: DeepPartial<CryptoAccount>) {
    return this.accounts.save(this.accounts.create({ id, ...input }));
  }

  findBalances(userId: string) {
    return this.balances.find({
      where: { userId },
      order: { asset: 'ASC' },
    });
  }

  upsertBalance(input: DeepPartial<CryptoBalance>) {
    return this.balances.upsert(input as any, ['accountId', 'asset']);
  }

  findOrderByIdempotency(userId: string, idempotencyKey: string) {
    return this.orders.findOne({ where: { userId, idempotencyKey } });
  }

  createOrder(input: DeepPartial<CryptoOrder>) {
    return this.orders.save(this.orders.create(input));
  }

  findOrders(userId: string) {
    return this.orders.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  findOrderForUser(userId: string, id: string) {
    return this.orders.findOne({ where: { id, userId } });
  }

  updateOrder(id: string, input: DeepPartial<CryptoOrder>) {
    return this.orders.save(this.orders.create({ id, ...input }));
  }

  findTransferByIdempotency(userId: string, idempotencyKey: string) {
    return this.transfers.findOne({ where: { userId, idempotencyKey } });
  }

  createTransfer(input: DeepPartial<CryptoTransfer>) {
    return this.transfers.save(this.transfers.create(input));
  }

  findTransfers(userId: string) {
    return this.transfers.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  findDepositAddressByIdempotency(userId: string, idempotencyKey: string) {
    return this.depositAddresses.findOne({
      where: { userId, idempotencyKey },
    });
  }

  createDepositAddress(input: DeepPartial<CryptoDepositAddress>) {
    return this.depositAddresses.save(this.depositAddresses.create(input));
  }

  findDepositAddresses(userId: string) {
    return this.depositAddresses.find({
      where: { userId, active: true },
      order: { createdAt: 'DESC' },
    });
  }

  findStakingByIdempotency(userId: string, idempotencyKey: string) {
    return this.stakingPositions.findOne({
      where: { userId, idempotencyKey },
    });
  }

  createStakingPosition(input: DeepPartial<CryptoStakingPosition>) {
    return this.stakingPositions.save(this.stakingPositions.create(input));
  }

  findStakingPositions(userId: string) {
    return this.stakingPositions.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  findStakingPositionForUser(userId: string, id: string) {
    return this.stakingPositions.findOne({ where: { id, userId } });
  }

  updateStakingPosition(id: string, input: DeepPartial<CryptoStakingPosition>) {
    return this.stakingPositions.save(
      this.stakingPositions.create({ id, ...input }),
    );
  }
}
