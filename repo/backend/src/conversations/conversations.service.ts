import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Conversation } from '../database/entities/conversation.entity';
import { Message, MessageType } from '../database/entities/message.entity';
import { Listing } from '../database/entities/listing.entity';
import { RateLimitEvent } from '../database/entities/rate-limit-event.entity';
import { CannedResponse } from '../database/entities/canned-response.entity';
import { AuditService } from '../audit/audit.service';
import { RiskService } from '../risk/risk.service';
import { ConversationFiltersDto } from './dto/conversation-filters.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { CreateCannedResponseDto } from './dto/canned-response.dto';

const CONV_RATE_LIMIT_MAX = 10;
const CONV_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

@Injectable()
export class ConversationsService {
  constructor(
    @InjectRepository(Conversation)
    private readonly convRepo: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly msgRepo: Repository<Message>,
    @InjectRepository(Listing)
    private readonly listingRepo: Repository<Listing>,
    @InjectRepository(RateLimitEvent)
    private readonly rateLimitRepo: Repository<RateLimitEvent>,
    @InjectRepository(CannedResponse)
    private readonly cannedRepo: Repository<CannedResponse>,
    private readonly auditService: AuditService,
    private readonly riskService: RiskService,
  ) {}

  async findAll(
    userId: string,
    role: string,
    filters: ConversationFiltersDto,
  ): Promise<Conversation[]> {
    const qb = this.convRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.listing', 'listing');

    if (role === 'vendor') {
      qb.where('c.vendorId = :userId', { userId });
    } else if (role === 'shopper') {
      qb.where(':userId = ANY(c.shopperIds)', { userId });
    }

    if (filters.archived !== undefined) {
      qb.andWhere('c.isArchived = :archived', { archived: filters.archived });
    }
    if (filters.listingId) {
      qb.andWhere('c.listingId = :listingId', { listingId: filters.listingId });
    }
    if (filters.keyword) {
      qb.andWhere('listing.title ILIKE :kw', { kw: `%${filters.keyword}%` });
    }
    if (filters.startDate) {
      qb.andWhere('c.createdAt >= :startDate', { startDate: new Date(filters.startDate) });
    }
    if (filters.endDate) {
      qb.andWhere('c.createdAt <= :endDate', { endDate: new Date(filters.endDate) });
    }

    return qb.orderBy('c.createdAt', 'DESC').getMany();
  }

  async create(shopperId: string, listingId: string): Promise<Conversation> {
    await this.enforceConversationRateLimit(shopperId);

    const listing = await this.listingRepo.findOne({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('Listing not found');

    const existing = await this.convRepo
      .createQueryBuilder('c')
      .where('c.listingId = :listingId', { listingId })
      .andWhere(':shopperId = ANY(c.shopperIds)', { shopperId })
      .getOne();

    if (existing) return existing;

    const conv = this.convRepo.create({
      listingId,
      vendorId: listing.vendorId,
      shopperIds: [shopperId],
    });
    const saved = await this.convRepo.save(conv);

    await this.rateLimitRepo.save(
      this.rateLimitRepo.create({ userId: shopperId, action: 'create_conversation' }),
    );

    await this.riskService.assessConversationCreation(shopperId);

    await this.auditService.log({
      action: 'conversation.create',
      actorId: shopperId,
      entityType: 'conversation',
      entityId: saved.id,
      after: { id: saved.id, listingId, vendorId: listing.vendorId } as unknown as Record<string, unknown>,
    });

    return saved;
  }

  async getConversationWithMessages(
    conversationId: string,
    userId: string,
    role: string,
  ): Promise<{ conversation: Conversation; messages: Message[] }> {
    const conv = await this.assertAccess(conversationId, userId, role);

    const qb = this.msgRepo
      .createQueryBuilder('m')
      .where('m.conversationId = :conversationId', { conversationId: conv.id })
      .orderBy('m.createdAt', 'ASC');

    if (role === 'shopper') {
      qb.andWhere('m.isInternal = false');
    }

    const messages = await qb.getMany();
    return { conversation: conv, messages };
  }

  async sendMessage(
    conversationId: string,
    senderId: string,
    role: string,
    dto: SendMessageDto,
  ): Promise<Message> {
    const conv = await this.assertAccess(conversationId, senderId, role);

    if (dto.type === 'text' && !dto.content) {
      throw new BadRequestException('Text messages require content');
    }
    if (dto.type === 'voice' && !dto.audioUrl) {
      throw new BadRequestException('Voice messages require audioUrl');
    }
    if (dto.isInternal && role !== 'vendor' && role !== 'admin') {
      throw new ForbiddenException('Only vendors and admins can send internal messages');
    }

    const msg = this.msgRepo.create({
      conversationId: conv.id,
      senderId,
      content: dto.content ?? '',
      type: dto.type === 'voice' ? MessageType.VOICE : MessageType.TEXT,
      audioUrl: dto.audioUrl ?? null,
      isInternal: dto.isInternal ?? false,
    });
    const saved = await this.msgRepo.save(msg);

    await this.auditService.log({
      action: 'message.create',
      actorId: senderId,
      entityType: 'message',
      entityId: saved.id,
      after: {
        id: saved.id,
        conversationId: conv.id,
        type: saved.type,
        isInternal: saved.isInternal,
      } as unknown as Record<string, unknown>,
    });

    return saved;
  }

  async archive(
    conversationId: string,
    userId: string,
    role: string,
  ): Promise<Conversation> {
    const conv = await this.assertAccess(conversationId, userId, role);

    if (role !== 'vendor' && role !== 'admin') {
      throw new ForbiddenException('Only vendors and admins can archive conversations');
    }

    conv.isArchived = true;
    const saved = await this.convRepo.save(conv);

    await this.auditService.log({
      action: 'conversation.archive',
      actorId: userId,
      entityType: 'conversation',
      entityId: conversationId,
    });

    return saved;
  }

  async getCannedResponses(): Promise<CannedResponse[]> {
    return this.cannedRepo.find({ order: { createdAt: 'DESC' } });
  }

  async createCannedResponse(
    dto: CreateCannedResponseDto,
    createdBy: string,
  ): Promise<CannedResponse> {
    const cr = this.cannedRepo.create({
      title: dto.title,
      body: dto.body,
      createdBy,
    });
    const saved = await this.cannedRepo.save(cr);

    await this.auditService.log({
      action: 'canned_response.create',
      actorId: createdBy,
      entityType: 'canned_response',
      entityId: saved.id,
      after: { id: saved.id, title: saved.title } as unknown as Record<string, unknown>,
    });

    return saved;
  }

  private async assertAccess(
    conversationId: string,
    userId: string,
    role: string,
  ): Promise<Conversation> {
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv) throw new NotFoundException('Conversation not found');

    const isVendor = role === 'vendor' && conv.vendorId === userId;
    const isShopper = role === 'shopper' && conv.shopperIds.includes(userId);
    const isAdmin = role === 'admin';

    if (!isVendor && !isShopper && !isAdmin) {
      throw new ForbiddenException('Access denied to this conversation');
    }
    return conv;
  }

  private async enforceConversationRateLimit(userId: string): Promise<void> {
    const windowStart = new Date(Date.now() - CONV_RATE_LIMIT_WINDOW_MS);
    const count = await this.rateLimitRepo.count({
      where: {
        userId,
        action: 'create_conversation',
        createdAt: MoreThanOrEqual(windowStart),
      },
    });
    if (count >= CONV_RATE_LIMIT_MAX) {
      throw new HttpException(
        'Rate limit exceeded: max 10 new conversations per 10 minutes',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
