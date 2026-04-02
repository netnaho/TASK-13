import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Campaign, CampaignType, CampaignStatus } from '../database/entities/campaign.entity';
import { SensitiveWord } from '../database/entities/sensitive-word.entity';
import { AuditService } from '../audit/audit.service';
import {
  CreateCampaignDto,
  UpdateCampaignDto,
  CampaignFiltersDto,
  SensitiveWordDto,
} from './dto/campaign.dto';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepo: Repository<Campaign>,
    @InjectRepository(SensitiveWord)
    private readonly wordRepo: Repository<SensitiveWord>,
    private readonly auditService: AuditService,
  ) {}

  async findAll(filters: CampaignFiltersDto): Promise<Campaign[]> {
    const qb = this.campaignRepo.createQueryBuilder('c');

    if (filters.type) {
      qb.andWhere('c.type = :type', { type: filters.type });
    }
    if (filters.status) {
      qb.andWhere('c.status = :status', { status: filters.status });
    }
    if (filters.startDate) {
      qb.andWhere('c.startTime >= :startDate', { startDate: new Date(filters.startDate) });
    }
    if (filters.endDate) {
      qb.andWhere('c.endTime <= :endDate', { endDate: new Date(filters.endDate) });
    }

    return qb.orderBy('c.createdAt', 'DESC').getMany();
  }

  async findActive(): Promise<Campaign[]> {
    const now = new Date();
    return this.campaignRepo
      .createQueryBuilder('c')
      .where('c.status = :status', { status: CampaignStatus.ACTIVE })
      .andWhere('c.startTime <= :now', { now })
      .andWhere('c.endTime >= :now', { now })
      .orderBy('c.slotIndex', 'ASC')
      .getMany();
  }

  async create(dto: CreateCampaignDto, actorId: string): Promise<Campaign> {
    if (new Date(dto.startTime) >= new Date(dto.endTime)) {
      throw new BadRequestException('startTime must be before endTime');
    }

    const campaign = this.campaignRepo.create({
      title: dto.title,
      type: dto.type,
      startTime: new Date(dto.startTime),
      endTime: new Date(dto.endTime),
      slotIndex: dto.slotIndex ?? 0,
      data: dto.data ?? {},
      status: (dto.status as CampaignStatus) ?? CampaignStatus.DRAFT,
    });
    const saved = await this.campaignRepo.save(campaign);

    await this.auditService.log({
      action: 'campaign.create',
      actorId,
      entityType: 'campaign',
      entityId: saved.id,
      after: { id: saved.id, title: saved.title } as unknown as Record<string, unknown>,
    });

    return saved;
  }

  async update(id: string, dto: UpdateCampaignDto, actorId: string): Promise<Campaign> {
    const campaign = await this.campaignRepo.findOne({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaign not found');

    const before = { ...campaign } as unknown as Record<string, unknown>;

    if (dto.startTime) campaign.startTime = new Date(dto.startTime);
    if (dto.endTime) campaign.endTime = new Date(dto.endTime);
    if (campaign.startTime >= campaign.endTime) {
      throw new BadRequestException('startTime must be before endTime');
    }
    if (dto.title !== undefined) campaign.title = dto.title;
    if (dto.status !== undefined) campaign.status = dto.status;
    if (dto.slotIndex !== undefined) campaign.slotIndex = dto.slotIndex;
    if (dto.data !== undefined) campaign.data = dto.data;

    const saved = await this.campaignRepo.save(campaign);

    await this.auditService.log({
      action: 'campaign.update',
      actorId,
      entityType: 'campaign',
      entityId: id,
      before,
      after: saved as unknown as Record<string, unknown>,
    });

    return saved;
  }

  async softDelete(id: string, actorId: string): Promise<void> {
    const campaign = await this.campaignRepo.findOne({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaign not found');

    await this.campaignRepo.softDelete(id);

    await this.auditService.log({
      action: 'campaign.delete',
      actorId,
      entityType: 'campaign',
      entityId: id,
      before: { id, title: campaign.title } as unknown as Record<string, unknown>,
    });
  }

  async getSensitiveWords(): Promise<SensitiveWord[]> {
    return this.wordRepo.find({ order: { createdAt: 'DESC' } });
  }

  async addSensitiveWord(dto: SensitiveWordDto, actorId: string): Promise<SensitiveWord> {
    const existing = await this.wordRepo.findOne({ where: { word: dto.word.toLowerCase() } });
    if (existing) throw new BadRequestException('Word already exists');

    const word = this.wordRepo.create({ word: dto.word.toLowerCase() });
    const saved = await this.wordRepo.save(word);

    await this.auditService.log({
      action: 'sensitive_word.create',
      actorId,
      entityType: 'sensitive_word',
      entityId: saved.id,
      after: { word: saved.word } as unknown as Record<string, unknown>,
    });

    return saved;
  }

  async removeSensitiveWord(id: string, actorId: string): Promise<void> {
    const word = await this.wordRepo.findOne({ where: { id } });
    if (!word) throw new NotFoundException('Sensitive word not found');

    await this.wordRepo.delete(id);

    await this.auditService.log({
      action: 'sensitive_word.delete',
      actorId,
      entityType: 'sensitive_word',
      entityId: id,
      before: { word: word.word } as unknown as Record<string, unknown>,
    });
  }
}
