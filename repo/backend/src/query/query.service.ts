import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, SelectQueryBuilder } from 'typeorm';
import { SavedQuery } from '../database/entities/saved-query.entity';
import { PowerQueryDto, QueryFilterItem } from './dto/query.dto';
import { EncryptionService } from '../common/encryption/encryption.service';

const ENTITY_MAP: Record<string, string> = {
  listings: 'Listing',
  users: 'User',
  conversations: 'Conversation',
  settlements: 'Settlement',
};

const ALLOWED_FIELDS: Record<string, string[]> = {
  listings: ['id', 'title', 'breed', 'region', 'priceUsd', 'age', 'rating', 'status', 'createdAt', 'vendorId'],
  users: ['id', 'username', 'role', 'isActive', 'createdAt'],
  conversations: ['id', 'listingId', 'vendorId', 'isArchived', 'isDisputed', 'createdAt'],
  settlements: ['id', 'vendorId', 'month', 'totalCharges', 'taxAmount', 'status', 'createdAt'],
};

@Injectable()
export class QueryService {
  constructor(
    @InjectRepository(SavedQuery)
    private readonly savedQueryRepo: Repository<SavedQuery>,
    private readonly dataSource: DataSource,
    private readonly encryption: EncryptionService,
  ) {}

  async execute(
    dto: PowerQueryDto,
    userId: string,
    role: string,
  ): Promise<{ items: unknown[]; total: number; page: number; limit: number; totalPages: number }> {
    const entityName = ENTITY_MAP[dto.entity];
    if (!entityName) throw new BadRequestException(`Unknown entity: ${dto.entity}`);

    if (role === 'vendor' && (dto.entity === 'users' || dto.entity === 'conversations')) {
      throw new ForbiddenException('Vendors cannot query users or conversations');
    }

    const allowed = ALLOWED_FIELDS[dto.entity] ?? [];
    const repo = this.dataSource.getRepository(entityName);
    const alias = 'e';
    const qb = repo.createQueryBuilder(alias);

    if (role === 'vendor' && dto.entity === 'listings') {
      qb.andWhere(`${alias}.vendorId = :userId`, { userId });
    }
    if (role === 'vendor' && dto.entity === 'settlements') {
      qb.andWhere(`${alias}.vendorId = :userId`, { userId });
    }

    if (dto.filters) {
      for (let i = 0; i < dto.filters.length; i++) {
        const f = dto.filters[i];
        if (!allowed.includes(f.field)) {
          throw new BadRequestException(`Field "${f.field}" not allowed for entity "${dto.entity}"`);
        }
        const paramName = `p${i}`;
        this.applyFilter(qb, alias, f, paramName);
      }
    }

    if (dto.sort && allowed.includes(dto.sort.field)) {
      qb.orderBy(`${alias}.${dto.sort.field}`, dto.sort.dir.toUpperCase() as 'ASC' | 'DESC');
    } else {
      qb.orderBy(`${alias}.createdAt`, 'DESC');
    }

    const page = Math.max(1, dto.page ?? 1);
    const limit = Math.min(100, Math.max(1, dto.limit ?? 20));
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();

    const masked = items.map((item: any) => {
      if (dto.entity === 'users' && role !== 'admin') {
        const { passwordHash, email, deviceFingerprint, ...safe } = item;
        return safe;
      }
      return item;
    });

    return {
      items: masked,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async saveQuery(userId: string, name: string, params: Record<string, unknown>): Promise<SavedQuery> {
    const sq = this.savedQueryRepo.create({ userId, name, params });
    return this.savedQueryRepo.save(sq);
  }

  async getSavedQueries(userId: string): Promise<SavedQuery[]> {
    return this.savedQueryRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async deleteSavedQuery(id: string, userId: string): Promise<void> {
    const sq = await this.savedQueryRepo.findOne({ where: { id } });
    if (!sq) throw new NotFoundException('Saved query not found');
    if (sq.userId !== userId) throw new ForbiddenException('Cannot delete another user\'s saved query');
    await this.savedQueryRepo.delete(id);
  }

  private applyFilter(
    qb: SelectQueryBuilder<any>,
    alias: string,
    filter: QueryFilterItem,
    paramName: string,
  ): void {
    const col = `${alias}.${filter.field}`;
    switch (filter.op) {
      case 'eq':
        qb.andWhere(`${col} = :${paramName}`, { [paramName]: filter.value });
        break;
      case 'gt':
        qb.andWhere(`${col} > :${paramName}`, { [paramName]: filter.value });
        break;
      case 'lt':
        qb.andWhere(`${col} < :${paramName}`, { [paramName]: filter.value });
        break;
      case 'gte':
        qb.andWhere(`${col} >= :${paramName}`, { [paramName]: filter.value });
        break;
      case 'lte':
        qb.andWhere(`${col} <= :${paramName}`, { [paramName]: filter.value });
        break;
      case 'contains':
        qb.andWhere(`${col} ILIKE :${paramName}`, { [paramName]: `%${filter.value}%` });
        break;
      case 'in':
        if (Array.isArray(filter.value)) {
          qb.andWhere(`${col} IN (:...${paramName})`, { [paramName]: filter.value });
        }
        break;
    }
  }
}
