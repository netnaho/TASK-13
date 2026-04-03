import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, SelectQueryBuilder } from 'typeorm';
import { Listing, ListingStatus } from '../database/entities/listing.entity';
import { SensitiveWord } from '../database/entities/sensitive-word.entity';
import { RateLimitEvent } from '../database/entities/rate-limit-event.entity';
import { AuditService } from '../audit/audit.service';
import { RiskService, RiskFlag } from '../risk/risk.service';
import { SearchListingsDto } from './dto/search-listings.dto';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { canViewListing } from './listing-visibility.policy';
import { RequestRiskContext } from '../common/risk/request-risk-context';

const TYPO_MAP: Record<string, string> = {
  retreiver: 'retriever',
  retrever: 'retriever',
  retriver: 'retriever',
  goldern: 'golden',
  goldne: 'golden',
  chiwawa: 'chihuahua',
  chiwahua: 'chihuahua',
  dalmation: 'dalmatian',
  dalmatin: 'dalmatian',
  persain: 'persian',
  persion: 'persian',
  siamise: 'siamese',
  siamees: 'siamese',
  siberain: 'siberian',
  sibiren: 'siberian',
  buldog: 'bulldog',
  pudle: 'poodle',
  poddle: 'poodle',
  labrodor: 'labrador',
  labredor: 'labrador',
  rotweiler: 'rottweiler',
  rotwiler: 'rottweiler',
  shepard: 'shepherd',
  sheperd: 'shepherd',
  beagel: 'beagle',
  huskey: 'husky',
  mane: 'maine',
};

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 30;

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  fallback?: { similarBreed: T[]; trending: T[] };
}

@Injectable()
export class ListingsService {
  constructor(
    @InjectRepository(Listing)
    private readonly listingRepo: Repository<Listing>,
    @InjectRepository(SensitiveWord)
    private readonly wordRepo: Repository<SensitiveWord>,
    @InjectRepository(RateLimitEvent)
    private readonly rateLimitRepo: Repository<RateLimitEvent>,
    private readonly auditService: AuditService,
    private readonly riskService: RiskService,
  ) {}

  async search(query: SearchListingsDto): Promise<PaginatedResult<Listing>> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const correctedQ = query.q ? this.correctTypos(query.q) : undefined;

    const qb = this.listingRepo
      .createQueryBuilder('l')
      .where('l.status = :status', { status: ListingStatus.ACTIVE })
      .andWhere('l.deletedAt IS NULL');

    if (correctedQ) {
      qb.andWhere(
        '(l.title ILIKE :q OR l.description ILIKE :q OR l.breed ILIKE :q)',
        { q: `%${correctedQ}%` },
      );
    }
    if (query.breed) {
      qb.andWhere('LOWER(l.breed) = LOWER(:breed)', { breed: query.breed });
    }
    if (query.region) {
      qb.andWhere('LOWER(l.region) = LOWER(:region)', { region: query.region });
    }
    if (query.minAge !== undefined) {
      qb.andWhere('l.age >= :minAge', { minAge: query.minAge });
    }
    if (query.maxAge !== undefined) {
      qb.andWhere('l.age <= :maxAge', { maxAge: query.maxAge });
    }
    if (query.minPrice !== undefined) {
      qb.andWhere('l.priceUsd >= :minPrice', { minPrice: query.minPrice });
    }
    if (query.maxPrice !== undefined) {
      qb.andWhere('l.priceUsd <= :maxPrice', { maxPrice: query.maxPrice });
    }
    if (query.minRating !== undefined) {
      qb.andWhere('l.rating >= :minRating', { minRating: query.minRating });
    }
    if (query.maxRating !== undefined) {
      qb.andWhere('l.rating <= :maxRating', { maxRating: query.maxRating });
    }
    if (query.newArrivals) {
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      qb.andWhere('l.createdAt >= :since', { since: fourteenDaysAgo });
    }

    this.applySorting(qb, query.sort);
    qb.skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();

    const result: PaginatedResult<Listing> = {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

    if (total === 0) {
      result.fallback = await this.buildFallback(query.breed ?? correctedQ);
    }

    return result;
  }

  async suggest(q: string): Promise<string[]> {
    if (!q || q.length < 1) return [];
    const corrected = this.correctTypos(q);
    const pattern = `%${corrected}%`;

    const breeds = await this.listingRepo
      .createQueryBuilder('l')
      .select('DISTINCT l.breed', 'value')
      .where('l.breed ILIKE :pattern', { pattern })
      .andWhere('l.status = :status', { status: ListingStatus.ACTIVE })
      .andWhere('l.deletedAt IS NULL')
      .limit(5)
      .getRawMany();

    const titles = await this.listingRepo
      .createQueryBuilder('l')
      .select('l.title', 'value')
      .where('l.title ILIKE :pattern', { pattern })
      .andWhere('l.status = :status', { status: ListingStatus.ACTIVE })
      .andWhere('l.deletedAt IS NULL')
      .limit(5)
      .getRawMany();

    const seen = new Set<string>();
    const results: string[] = [];
    for (const row of [...breeds, ...titles]) {
      const v = row.value as string;
      if (!seen.has(v.toLowerCase())) {
        seen.add(v.toLowerCase());
        results.push(v);
      }
      if (results.length >= 10) break;
    }
    return results;
  }

  async findOne(
    id: string,
    requesterRole?: string,
    requesterId?: string,
  ): Promise<Listing> {
    const listing = await this.listingRepo.findOne({
      where: { id },
      relations: ['vendor'],
    });
    if (!listing || !canViewListing(listing, requesterRole, requesterId)) {
      throw new NotFoundException('Listing not found');
    }
    return listing;
  }

  async create(
    vendorId: string,
    dto: CreateListingDto,
    riskCtx: RequestRiskContext = { ip: undefined, deviceFingerprint: undefined },
  ): Promise<{ listing: Listing; flagged: boolean; reason?: string; duplicateWarning?: string }> {
    await this.enforceRateLimit(vendorId);

    const duplicateWarning = await this.detectDuplicate(vendorId, dto.title);
    const { flagged } = await this.checkSensitiveWords(dto.title, dto.description);

    // Risk assessment runs BEFORE the save so flags can influence listing status
    const riskFlags = await this.riskService.assessListingCreation(
      vendorId,
      dto.breed,
      riskCtx.deviceFingerprint,
      riskCtx.ip,
    );

    const shouldReview = flagged || riskFlags.length > 0;

    const listing = this.listingRepo.create({
      ...dto,
      vendorId,
      photos: dto.photos ?? [],
      status: shouldReview ? ListingStatus.PENDING_REVIEW : ListingStatus.ACTIVE,
      sensitiveWordFlagged: flagged,
    });
    const saved = await this.listingRepo.save(listing);

    await this.rateLimitRepo.save(
      this.rateLimitRepo.create({ userId: vendorId, action: 'create_listing' }),
    );

    await this.auditService.log({
      action: 'listing.create',
      actorId: vendorId,
      entityType: 'listing',
      entityId: saved.id,
      after: { id: saved.id, title: saved.title, status: saved.status } as unknown as Record<string, unknown>,
    });

    const result: { listing: Listing; flagged: boolean; reason?: string; duplicateWarning?: string; riskFlags?: RiskFlag[] } = {
      listing: saved,
      flagged: shouldReview,
    };
    if (shouldReview) {
      result.reason = flagged
        ? 'Review required: prohibited terms detected'
        : 'Review required: risk signals detected';
    }
    if (duplicateWarning) result.duplicateWarning = duplicateWarning;
    if (riskFlags.length > 0) result.riskFlags = riskFlags;
    return result;
  }

  async update(
    id: string,
    userId: string,
    userRole: string,
    dto: UpdateListingDto,
  ): Promise<{ listing: Listing; flagged: boolean; reason?: string }> {
    const listing = await this.listingRepo.findOne({ where: { id } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (userRole !== 'admin' && listing.vendorId !== userId) {
      throw new ForbiddenException('You can only update your own listings');
    }

    const before = { ...listing } as unknown as Record<string, unknown>;
    const newTitle = dto.title ?? listing.title;
    const newDesc = dto.description ?? listing.description;
    const { flagged } = await this.checkSensitiveWords(newTitle, newDesc);

    Object.assign(listing, dto);
    if (dto.photos !== undefined) listing.photos = dto.photos;
    listing.sensitiveWordFlagged = flagged;
    if (flagged) listing.status = ListingStatus.PENDING_REVIEW;

    const saved = await this.listingRepo.save(listing);

    await this.auditService.log({
      action: 'listing.update',
      actorId: userId,
      entityType: 'listing',
      entityId: id,
      before,
      after: { id: saved.id, title: saved.title, status: saved.status } as unknown as Record<string, unknown>,
    });

    const result: { listing: Listing; flagged: boolean; reason?: string } = { listing: saved, flagged };
    if (flagged) result.reason = 'Review required: prohibited terms detected';
    return result;
  }

  async softDelete(id: string, userId: string, userRole: string): Promise<void> {
    const listing = await this.listingRepo.findOne({ where: { id } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (userRole !== 'admin' && listing.vendorId !== userId) {
      throw new ForbiddenException('You can only delete your own listings');
    }

    await this.listingRepo.softDelete(id);

    await this.auditService.log({
      action: 'listing.delete',
      actorId: userId,
      entityType: 'listing',
      entityId: id,
      before: { id: listing.id, title: listing.title } as unknown as Record<string, unknown>,
    });
  }

  private correctTypos(input: string): string {
    return input
      .split(/\s+/)
      .map((word) => TYPO_MAP[word.toLowerCase()] ?? word)
      .join(' ');
  }

  private applySorting(qb: SelectQueryBuilder<Listing>, sort?: string): void {
    switch (sort) {
      case 'price_asc':
        qb.orderBy('l.priceUsd', 'ASC');
        break;
      case 'price_desc':
        qb.orderBy('l.priceUsd', 'DESC');
        break;
      case 'rating_desc':
        qb.orderBy('l.rating', 'DESC');
        break;
      case 'newest':
      default:
        qb.orderBy('l.createdAt', 'DESC');
        break;
    }
  }

  private async buildFallback(
    breedHint?: string,
  ): Promise<{ similarBreed: Listing[]; trending: Listing[] }> {
    let similarBreed: Listing[] = [];
    if (breedHint) {
      similarBreed = await this.listingRepo
        .createQueryBuilder('l')
        .where('l.status = :status', { status: ListingStatus.ACTIVE })
        .andWhere('l.deletedAt IS NULL')
        .andWhere('l.breed ILIKE :breed', { breed: `%${breedHint}%` })
        .orderBy('l.rating', 'DESC')
        .limit(5)
        .getMany();
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const trending = await this.listingRepo
      .createQueryBuilder('l')
      .where('l.status = :status', { status: ListingStatus.ACTIVE })
      .andWhere('l.deletedAt IS NULL')
      .andWhere('l.createdAt >= :since', { since: sevenDaysAgo })
      .orderBy('l.rating', 'DESC')
      .limit(5)
      .getMany();

    return { similarBreed, trending };
  }

  private async checkSensitiveWords(
    title: string,
    description: string,
  ): Promise<{ flagged: boolean; matchedWords: string[] }> {
    const words = await this.wordRepo.find();
    const combined = `${title} ${description}`.toLowerCase();
    const matched = words.filter((sw) => combined.includes(sw.word.toLowerCase()));
    return { flagged: matched.length > 0, matchedWords: matched.map((w) => w.word) };
  }

  private async enforceRateLimit(vendorId: string): Promise<void> {
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
    const count = await this.rateLimitRepo.count({
      where: {
        userId: vendorId,
        action: 'create_listing',
        createdAt: MoreThanOrEqual(windowStart),
      },
    });
    if (count >= RATE_LIMIT_MAX) {
      throw new HttpException('Rate limit exceeded: max 30 listings per hour', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async detectDuplicate(vendorId: string, title: string): Promise<string | undefined> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await this.listingRepo
      .createQueryBuilder('l')
      .where('l.vendorId = :vendorId', { vendorId })
      .andWhere('l.createdAt >= :since', { since: oneDayAgo })
      .andWhere('l.deletedAt IS NULL')
      .getMany();

    const inputTokens = this.tokenize(title);
    if (inputTokens.length === 0) return undefined;

    for (const listing of recent) {
      const existingTokens = this.tokenize(listing.title);
      if (existingTokens.length === 0) continue;
      const intersection = inputTokens.filter((t) => existingTokens.includes(t));
      const overlap = intersection.length / Math.max(inputTokens.length, existingTokens.length);
      if (overlap >= 0.8) {
        return `Near-duplicate detected: similar to "${listing.title}" (${Math.round(overlap * 100)}% overlap)`;
      }
    }
    return undefined;
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  }
}
