import {
  Injectable,
  NotFoundException,
  OnModuleInit,
  OnModuleDestroy,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan, DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { ExportJob, ExportJobStatus } from '../database/entities/export-job.entity';
import { CreateExportJobDto } from './dto/export.dto';
import { EncryptionService } from '../common/encryption/encryption.service';
import { logger } from '../common/logger/winston.logger';

const MAX_CONCURRENT = 2;
const EXPIRY_DAYS = 7;
const EXPORT_DIR = '/tmp/exports';
const POLL_INTERVAL_MS = 5000;

@Injectable()
export class ExportsService implements OnModuleInit, OnModuleDestroy {
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(ExportJob)
    private readonly exportRepo: Repository<ExportJob>,
    private readonly dataSource: DataSource,
    private readonly encryption: EncryptionService,
  ) {}

  onModuleInit() {
    if (!fs.existsSync(EXPORT_DIR)) {
      fs.mkdirSync(EXPORT_DIR, { recursive: true });
    }
    this.pollTimer = setInterval(() => this.processPendingJobs(), POLL_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  async createJob(requesterId: string, dto: CreateExportJobDto): Promise<ExportJob> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + EXPIRY_DAYS);

    const job = this.exportRepo.create({
      requesterId,
      status: ExportJobStatus.QUEUED,
      params: { type: dto.type, filters: dto.filters ?? {} },
      expiresAt,
    });

    return this.exportRepo.save(job);
  }

  async findAll(requesterId: string, role: string): Promise<ExportJob[]> {
    if (role === 'admin') {
      return this.exportRepo.find({ order: { createdAt: 'DESC' } });
    }
    return this.exportRepo.find({
      where: { requesterId },
      order: { createdAt: 'DESC' },
    });
  }

  async getJobStatus(id: string, requesterId: string, role: string): Promise<ExportJob> {
    const job = await this.exportRepo.findOne({ where: { id } });
    if (!job) throw new NotFoundException('Export job not found');
    if (role !== 'admin' && job.requesterId !== requesterId) {
      throw new NotFoundException('Export job not found');
    }
    return job;
  }

  async downloadFile(
    id: string,
    requesterId: string,
    role: string,
  ): Promise<{ filePath: string; fileName: string }> {
    const job = await this.getJobStatus(id, requesterId, role);

    if (job.status === ExportJobStatus.EXPIRED) {
      throw new NotFoundException('Export file has expired');
    }
    if (job.status !== ExportJobStatus.DONE || !job.filePath) {
      throw new HttpException('Export is still processing', HttpStatus.ACCEPTED);
    }
    if (job.expiresAt && new Date() > new Date(job.expiresAt)) {
      await this.exportRepo.update(id, { status: ExportJobStatus.EXPIRED });
      throw new NotFoundException('Export file has expired');
    }

    return { filePath: job.filePath, fileName: `export-${id}.csv` };
  }

  private async processPendingJobs(): Promise<void> {
    try {
      await this.expireOldJobs();

      const runningCount = await this.exportRepo.count({
        where: { status: ExportJobStatus.RUNNING },
      });
      if (runningCount >= MAX_CONCURRENT) return;

      const slotsAvailable = MAX_CONCURRENT - runningCount;
      const queued = await this.exportRepo.find({
        where: { status: ExportJobStatus.QUEUED },
        order: { createdAt: 'ASC' },
        take: slotsAvailable,
      });

      for (const job of queued) {
        this.processJob(job).catch((err) => {
          logger.error(`Export job ${job.id} failed: ${err}`, { context: 'ExportProcessor' });
        });
      }
    } catch (err) {
      logger.error(`Export poll error: ${err}`, { context: 'ExportProcessor' });
    }
  }

  private async processJob(job: ExportJob): Promise<void> {
    await this.exportRepo.update(job.id, { status: ExportJobStatus.RUNNING });

    try {
      const type = job.params.type as string;
      const filters = (job.params.filters ?? {}) as Record<string, unknown>;
      const requester = await this.dataSource
        .getRepository('User')
        .findOne({ where: { id: job.requesterId } });
      const isAdmin = !!(requester && (requester as any).role === 'admin');

      let csv = '';

      switch (type) {
        case 'listings':
          csv = await this.exportListings(filters, isAdmin);
          break;
        case 'conversations':
          csv = await this.exportConversations(filters, isAdmin);
          break;
        case 'settlements':
          csv = await this.exportSettlements(filters, isAdmin);
          break;
        case 'audit':
          csv = await this.exportAudit(filters);
          break;
        default:
          csv = 'id\nno_data';
      }

      const filePath = path.join(EXPORT_DIR, `${job.id}.csv`);
      fs.writeFileSync(filePath, csv, 'utf-8');

      await this.exportRepo.update(job.id, {
        status: ExportJobStatus.DONE,
        filePath,
      });
    } catch (err) {
      await this.exportRepo.update(job.id, { status: ExportJobStatus.FAILED });
      throw err;
    }
  }

  private async exportListings(
    filters: Record<string, unknown>,
    isAdmin: boolean,
  ): Promise<string> {
    const qb = this.dataSource
      .getRepository('Listing')
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.vendor', 'v')
      .orderBy('l.createdAt', 'DESC');

    if (filters.status) qb.andWhere('l.status = :status', { status: filters.status });
    if (filters.breed) qb.andWhere('l.breed = :breed', { breed: filters.breed });

    const listings = await qb.getMany();
    const header = 'ID,Title,Breed,Region,Price,Status,Vendor,Created At';
    const rows = listings.map((l: any) =>
      [l.id, esc(l.title), esc(l.breed), esc(l.region), l.priceUsd, l.status, l.vendor?.username ?? '', l.createdAt].join(','),
    );
    return [header, ...rows].join('\n');
  }

  private async exportConversations(
    filters: Record<string, unknown>,
    isAdmin: boolean,
  ): Promise<string> {
    const qb = this.dataSource
      .getRepository('Conversation')
      .createQueryBuilder('c')
      .orderBy('c.createdAt', 'DESC');

    const conversations = await qb.getMany();
    const header = 'ID,Listing ID,Vendor ID,Archived,Disputed,Created At';
    const rows = conversations.map((c: any) =>
      [c.id, c.listingId, c.vendorId, c.isArchived, c.isDisputed, c.createdAt].join(','),
    );
    return [header, ...rows].join('\n');
  }

  private async exportSettlements(
    filters: Record<string, unknown>,
    isAdmin: boolean,
  ): Promise<string> {
    const qb = this.dataSource
      .getRepository('Settlement')
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.vendor', 'v')
      .orderBy('s.createdAt', 'DESC');

    if (filters.month) qb.andWhere('s.month = :month', { month: filters.month });
    if (filters.status) qb.andWhere('s.status = :status', { status: filters.status });

    const settlements = await qb.getMany();
    const header = 'ID,Vendor,Month,Total Charges,Tax Amount,Status,Created At';
    const rows = settlements.map((s: any) => {
      const vendorEmail = s.vendor?.email
        ? isAdmin
          ? this.encryption.decrypt(s.vendor.email)
          : '***masked***'
        : 'N/A';
      return [s.id, s.vendor?.username ?? '', s.month, s.totalCharges, s.taxAmount, s.status, s.createdAt].join(',');
    });
    return [header, ...rows].join('\n');
  }

  private async exportAudit(filters: Record<string, unknown>): Promise<string> {
    const qb = this.dataSource
      .getRepository('AuditLog')
      .createQueryBuilder('a')
      .orderBy('a.createdAt', 'DESC');

    if (filters.action) qb.andWhere('a.action = :action', { action: filters.action });
    if (filters.entityType) qb.andWhere('a.entityType = :entityType', { entityType: filters.entityType });

    const logs = await qb.limit(10000).getMany();
    const header = 'ID,Action,Actor,Entity Type,Entity ID,Hash,Created At';
    const rows = logs.map((l: any) =>
      [l.id, l.action, l.actorId, l.entityType, l.entityId ?? '', l.hash, l.createdAt].join(','),
    );
    return [header, ...rows].join('\n');
  }

  private async expireOldJobs(): Promise<void> {
    const now = new Date();
    await this.exportRepo
      .createQueryBuilder()
      .update()
      .set({ status: ExportJobStatus.EXPIRED })
      .where('status = :done', { done: ExportJobStatus.DONE })
      .andWhere('"expiresAt" < :now', { now })
      .execute();
  }
}

function esc(val: string): string {
  if (!val) return '';
  return `"${val.replace(/"/g, '""')}"`;
}
