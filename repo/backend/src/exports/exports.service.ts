import {
  Injectable,
  NotFoundException,
  ForbiddenException,
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
import { safeDeleteFile } from './export-file.util';

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

  async createJob(requesterId: string, requesterRole: string, dto: CreateExportJobDto): Promise<ExportJob> {
    // Audit exports contain internal security data — admin only
    if (dto.type === 'audit' && requesterRole !== 'admin') {
      throw new ForbiddenException('Audit exports are restricted to admins');
    }
    // ops_reviewer and finance_admin may only export settlements
    if (
      (requesterRole === 'ops_reviewer' || requesterRole === 'finance_admin') &&
      dto.type !== 'settlements'
    ) {
      throw new ForbiddenException(`Role ${requesterRole} may only export settlements`);
    }

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
      await this.expireJob(job);
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
      const requesterRole: string = (requester as any)?.role ?? 'vendor';
      const isAdmin = requesterRole === 'admin';

      const ctx: ExportContext = {
        requesterId: job.requesterId,
        requesterRole,
        isAdmin,
        maskEmail: (encrypted: string | null | undefined) =>
          !encrypted ? 'N/A' : isAdmin ? this.encryption.decrypt(encrypted) : '***',
      };

      let csv = '';

      switch (type) {
        case 'listings':
          csv = await this.exportListings(filters, ctx);
          break;
        case 'conversations':
          csv = await this.exportConversations(filters, ctx);
          break;
        case 'settlements':
          csv = await this.exportSettlements(filters, ctx);
          break;
        case 'audit':
          csv = await this.exportAudit(filters, ctx);
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
    ctx: ExportContext,
  ): Promise<string> {
    const qb = this.dataSource
      .getRepository('Listing')
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.vendor', 'v')
      .orderBy('l.createdAt', 'DESC');

    if (!ctx.isAdmin) qb.andWhere('l.vendorId = :requesterId', { requesterId: ctx.requesterId });
    if (filters.status) qb.andWhere('l.status = :status', { status: filters.status });
    if (filters.breed) qb.andWhere('l.breed = :breed', { breed: filters.breed });

    const listings = await qb.getMany();
    const header = 'ID,Title,Breed,Region,Price,Status,Vendor,Vendor Email,Created At';
    const rows = listings.map((l: any) =>
      [
        l.id, esc(l.title), esc(l.breed), esc(l.region), l.priceUsd, l.status,
        l.vendor?.username ?? '', ctx.maskEmail(l.vendor?.email), l.createdAt,
      ].join(','),
    );
    return formatExportCsv(header, rows, ctx);
  }

  private async exportConversations(
    filters: Record<string, unknown>,
    ctx: ExportContext,
  ): Promise<string> {
    const qb = this.dataSource
      .getRepository('Conversation')
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.vendor', 'v')
      .orderBy('c.createdAt', 'DESC');

    if (!ctx.isAdmin) qb.andWhere('c.vendorId = :requesterId', { requesterId: ctx.requesterId });

    const conversations = await qb.getMany();
    const header = 'ID,Listing ID,Vendor,Vendor Email,Archived,Disputed,Created At';
    const rows = conversations.map((c: any) =>
      [
        c.id, c.listingId, (c as any).vendor?.username ?? c.vendorId,
        ctx.maskEmail((c as any).vendor?.email), c.isArchived, c.isDisputed, c.createdAt,
      ].join(','),
    );
    return formatExportCsv(header, rows, ctx);
  }

  private async exportSettlements(
    filters: Record<string, unknown>,
    ctx: ExportContext,
  ): Promise<string> {
    const qb = this.dataSource
      .getRepository('Settlement')
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.vendor', 'v')
      .orderBy('s.createdAt', 'DESC');

    if (ctx.requesterRole === 'vendor') {
      qb.andWhere('s.vendorId = :requesterId', { requesterId: ctx.requesterId });
    }
    if (filters.month) qb.andWhere('s.month = :month', { month: filters.month });
    if (filters.status) qb.andWhere('s.status = :status', { status: filters.status });

    const settlements = await qb.getMany();
    const header = 'ID,Vendor,Vendor Email,Month,Total Charges,Tax Amount,Status,Created At';
    const rows = settlements.map((s: any) =>
      [
        s.id, s.vendor?.username ?? '', ctx.maskEmail(s.vendor?.email),
        s.month, s.totalCharges, s.taxAmount, s.status, s.createdAt,
      ].join(','),
    );
    return formatExportCsv(header, rows, ctx);
  }

  private async exportAudit(
    filters: Record<string, unknown>,
    ctx: ExportContext,
  ): Promise<string> {
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
    return formatExportCsv(header, rows, ctx);
  }

  private async expireOldJobs(): Promise<void> {
    const now = new Date();
    const toExpire = await this.exportRepo.find({
      where: { status: ExportJobStatus.DONE, expiresAt: LessThan(now) },
    });
    for (const job of toExpire) {
      await this.expireJob(job).catch((err: unknown) => {
        logger.error(`Failed to expire job ${job.id}: ${err}`, { context: 'ExportExpiry' });
      });
    }
  }

  /**
   * Expire a single export job atomically:
   *  1. Delete the file from disk (best-effort — ENOENT is treated as already-gone).
   *  2. UPDATE WHERE status='done' to EXPIRED + filePath=null (compare-and-set).
   *     If affected=0, another worker already expired it — safe to ignore.
   *
   * Exposed as public so it can be driven directly from tests and from
   * downloadFile's inline expiry path.
   */
  async expireJob(job: ExportJob): Promise<void> {
    if (job.filePath) {
      const result = safeDeleteFile(job.filePath);
      if (result.deleted) {
        logger.info(`Deleted export file: ${job.filePath}`, { context: 'ExportExpiry' });
      } else {
        // file_not_found is expected when a previous expiry run already removed it
        logger.warn(
          `Export file not deleted (${result.error}): ${job.filePath}`,
          { context: 'ExportExpiry' },
        );
      }
    }

    // Atomic compare-and-set: only commits if this worker wins the race
    const updateResult = await this.exportRepo
      .createQueryBuilder()
      .update()
      .set({ status: ExportJobStatus.EXPIRED, filePath: () => 'NULL' })
      .where('id = :id', { id: job.id })
      .andWhere('status = :done', { done: ExportJobStatus.DONE })
      .execute();

    if (!updateResult.affected || updateResult.affected === 0) {
      logger.info(
        `Export job ${job.id} already expired by concurrent worker — skipping`,
        { context: 'ExportExpiry' },
      );
    }
  }
}

/** Shared context threaded through every export function. */
interface ExportContext {
  requesterId: string;
  requesterRole: string;
  isAdmin: boolean;
  /** Decrypt if admin, mask to '***' otherwise, 'N/A' if null. */
  maskEmail: (encrypted: string | null | undefined) => string;
}

function esc(val: string): string {
  if (!val) return '';
  return `"${val.replace(/"/g, '""')}"`;
}

/**
 * Central formatter — every export flows through here.
 * Guarantees a watermark row is always present.
 */
function formatExportCsv(header: string, rows: string[], ctx: ExportContext): string {
  const wm = `# Generated for: ${ctx.requesterRole} / ${ctx.requesterId} at ${new Date().toISOString()}`;
  return [wm, header, ...rows].join('\n');
}
