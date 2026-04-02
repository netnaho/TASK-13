import {
  IsString,
  IsNumber,
  IsPositive,
  IsOptional,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateListingDto {
  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsString()
  breed: string;

  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  age: number;

  @IsString()
  region: string;

  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  priceUsd: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];
}
