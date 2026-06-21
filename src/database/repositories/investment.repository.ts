import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { InvestmentAccount } from '../entities/investment-account.entity';
import { InvestmentFunding } from '../entities/investment-funding.entity';
import { InvestmentOrder } from '../entities/investment-order.entity';
import { InvestmentPosition } from '../entities/investment-position.entity';
import { InvestmentProduct } from '../entities/investment-product.entity';

@Injectable()
export class InvestmentRepository {
  constructor(
    @InjectRepository(InvestmentAccount)
    private readonly accounts: Repository<InvestmentAccount>,
    @InjectRepository(InvestmentProduct)
    private readonly products: Repository<InvestmentProduct>,
    @InjectRepository(InvestmentPosition)
    private readonly positions: Repository<InvestmentPosition>,
    @InjectRepository(InvestmentOrder)
    private readonly orders: Repository<InvestmentOrder>,
    @InjectRepository(InvestmentFunding)
    private readonly funding: Repository<InvestmentFunding>,
  ) {}

  findAccount(userId: string) {
    return this.accounts.findOne({ where: { userId } });
  }

  createAccount(input: DeepPartial<InvestmentAccount>) {
    return this.accounts.save(this.accounts.create(input));
  }

  updateAccount(id: string, input: DeepPartial<InvestmentAccount>) {
    return this.accounts.save(this.accounts.create({ id, ...input }));
  }

  findActiveProducts() {
    return this.products.find({
      where: { active: true },
      order: { name: 'ASC' },
    });
  }

  findProduct(id: string) {
    return this.products.findOne({ where: { id, active: true } });
  }

  findProductByProviderId(providerProductId: string) {
    return this.products.findOne({ where: { providerProductId } });
  }

  upsertProduct(input: DeepPartial<InvestmentProduct>) {
    return this.products.upsert(input as any, ['providerProductId']);
  }

  findPositions(userId: string) {
    return this.positions.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  upsertPosition(input: DeepPartial<InvestmentPosition>) {
    return this.positions.upsert(input as any, ['accountId', 'productId']);
  }

  findOrderByIdempotency(userId: string, idempotencyKey: string) {
    return this.orders.findOne({ where: { userId, idempotencyKey } });
  }

  createOrder(input: DeepPartial<InvestmentOrder>) {
    return this.orders.save(this.orders.create(input));
  }

  findOrders(userId: string) {
    return this.orders.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  findFundingByIdempotency(userId: string, idempotencyKey: string) {
    return this.funding.findOne({ where: { userId, idempotencyKey } });
  }

  createFunding(input: DeepPartial<InvestmentFunding>) {
    return this.funding.save(this.funding.create(input));
  }

  findFunding(userId: string) {
    return this.funding.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }
}
