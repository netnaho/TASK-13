import {
  IsString,
  IsNumber,
  IsPositive,
  IsOptional,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateListingDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  breed?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  age?: number;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  priceUsd?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];
}
