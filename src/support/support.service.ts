import { Injectable } from '@nestjs/common';
import { SupportTicketPriority, SupportTicketStatus } from 'src/database/entities/support-ticket.entity';
import { SupportTicketRepository } from 'src/database/repositories/support-ticket.repository';
import { API_MESSAGES } from 'src/utils/apiMessages';
import { CONFIG_VARIABLES } from 'src/utils/config';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';

const FAQS = [
  {
    id: 'wallet-funding',
    category: 'Wallet',
    question: 'How do I fund my VidalPay wallet?',
    answer:
      'Use your assigned receive rails from the app, or use card top-up when it is enabled for your region.',
  },
  {
    id: 'kyc-transfers',
    category: 'Verification',
    question: 'Why are transfers disabled on my account?',
    answer:
      'Transfers remain disabled until your supported region is resolved, KYC is verified, and your transaction PIN is set.',
  },
  {
    id: 'security-pin',
    category: 'Security',
    question: 'What is my transaction PIN used for?',
    answer:
      'Your 4-digit transaction PIN protects outgoing money actions such as transfers, airtime, data, utility payments, and provider-backed payouts.',
  },
  {
    id: 'support-response',
    category: 'Support',
    question: 'How quickly does support respond?',
    answer:
      'Critical account and payment issues are prioritised first. Standard staging support requests are typically reviewed within one business day.',
  },
];

@Injectable()
export class SupportService {
  constructor(
    private readonly supportTicketRepository: SupportTicketRepository,
  ) {}

  async getOverview() {
    return {
      contact: {
        email: CONFIG_VARIABLES.SUPPORT_EMAIL,
        phone: CONFIG_VARIABLES.SUPPORT_PHONE,
      },
      responseWindows: {
        urgent: 'Same business day',
        standard: 'Within 1 business day',
      },
      categories: [
        'Wallet',
        'Verification',
        'Transfers',
        'Payments',
        'Security',
        'Profile',
        'General',
      ],
      faqCount: FAQS.length,
      ticketingEnabled: true,
    };
  }

  async getFaqs() {
    return FAQS;
  }

  async createTicket(userId: string, createSupportTicketDto: CreateSupportTicketDto) {
    const ticket = await this.supportTicketRepository.create({
      userId,
      category: createSupportTicketDto.category.trim(),
      subject: createSupportTicketDto.subject.trim(),
      message: createSupportTicketDto.message.trim(),
      priority:
        createSupportTicketDto.priority ?? SupportTicketPriority.NORMAL,
      preferredChannel: createSupportTicketDto.preferredChannel?.trim() ?? null,
      status: SupportTicketStatus.OPEN,
      metadata: createSupportTicketDto.metadata ?? null,
    });

    return {
      message: API_MESSAGES.SUPPORT_TICKET_CREATED,
      ticket: this.serializeTicket(ticket),
    };
  }

  async getUserTickets(userId: string) {
    const tickets = await this.supportTicketRepository.findUserTickets(userId);
    return tickets.map((ticket) => this.serializeTicket(ticket));
  }

  private serializeTicket(ticket: {
    id: string;
    category: string;
    subject: string;
    message: string;
    priority: SupportTicketPriority;
    status: SupportTicketStatus;
    preferredChannel: string | null;
    resolutionSummary: string | null;
    metadata: Record<string, any> | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: ticket.id,
      category: ticket.category,
      subject: ticket.subject,
      message: ticket.message,
      priority: ticket.priority,
      status: ticket.status,
      preferredChannel: ticket.preferredChannel,
      resolutionSummary: ticket.resolutionSummary,
      metadata: ticket.metadata,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    };
  }
}
