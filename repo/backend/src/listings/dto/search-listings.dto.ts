import { IsOptional, IsString, IsIn, IsBoolean } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class SearchListingsDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  breed?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @Type(() => Number)
  minAge?: number;

  @IsOptional()
  @Type(() => Number)
  maxAge?: number;

  @IsOptional()
  @Type(() => Number)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  maxPrice?: number;

  @IsOptional()
  @Type(() => Number)
  minRating?: number;

  @IsOptional()
  @Type(() => Number)
  maxRating?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  newArrivals?: boolean;

  @IsOptional()
  @IsIn(['price_asc', 'price_desc', 'rating_desc', 'newest'])
  sort?: string;

  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  limit?: number;
}

export class SuggestDto {
  @IsOptional()
  @IsString()
  q?: string;
}
