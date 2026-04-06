import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AbstractRepository } from 'src/database/abstract.repository';
import { SupportTicket } from '../entities/support-ticket.entity';

@Injectable()
export class SupportTicketRepository extends AbstractRepository<SupportTicket> {
  protected readonly logger = new Logger(SupportTicketRepository.name);

  constructor(
    @InjectRepository(SupportTicket)
    protected readonly supportTicketEntityRepository: Repository<SupportTicket>,
  ) {
    super(supportTicketEntityRepository);
  }

  async findUserTickets(userId: string): Promise<SupportTicket[]> {
    return this.find({
      where: {
        userId,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }
}
