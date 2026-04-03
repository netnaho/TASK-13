import { IsOptional, IsString, IsBoolean, IsDateString, IsInt, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class ConversationFiltersDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  archived?: boolean;

  @IsOptional()
  @IsString()
  listingId?: string;

  /**
   * Case-insensitive substring search.
   *
   * Matching order (OR logic — a conversation is returned if either matches):
   *   1. **Primary** — any message in the conversation whose `content` field
   *      contains the keyword (text messages only; voice messages have no
   *      content body).
   *   2. **Secondary** — the linked listing's `title` contains the keyword.
   *
   * Implemented as a correlated EXISTS subquery so it never produces duplicate
   * rows and does not affect pagination counts.
   */
  @IsOptional()
  @IsString()
  keyword?: string;

  /**
   * Lower bound (inclusive) on **conversation** `createdAt`.
   *
   * Date-range filters always target the conversation's own creation timestamp,
   * not individual message timestamps. This keeps filtering deterministic even
   * for conversations that have no messages yet.
   *
   * Accepted format: ISO-8601 string (e.g. "2024-01-01" or
   * "2024-01-01T00:00:00Z").
   */
  @IsOptional()
  @IsDateString()
  startDate?: string;

  /**
   * Upper bound (inclusive) on **conversation** `createdAt`.
   * See `startDate` for semantics.
   */
  @IsOptional()
  @IsDateString()
  endDate?: string;

  /** Page number (1-based). Defaults to 1. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  /**
   * Items per page. Defaults to 20, capped at 100.
   * Keeping this bounded prevents unbounded result sets and lets callers
   * rely on deterministic ordering across pages.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
