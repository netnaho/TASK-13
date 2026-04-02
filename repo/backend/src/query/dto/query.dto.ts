import {
  IsString,
  IsOptional,
  IsArray,
  IsIn,
  IsObject,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

export class QueryFilterItem {
  @IsString()
  field: string;

  @IsIn(['eq', 'gt', 'lt', 'gte', 'lte', 'contains', 'in'])
  op: string;

  value: unknown;
}

export class QuerySortDto {
  @IsString()
  field: string;

  @IsIn(['ASC', 'DESC', 'asc', 'desc'])
  dir: string;
}

export class PowerQueryDto {
  @IsIn(['listings', 'users', 'conversations', 'settlements'])
  entity: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QueryFilterItem)
  filters?: QueryFilterItem[];

  @IsOptional()
  @ValidateNested()
  @Type(() => QuerySortDto)
  sort?: QuerySortDto;

  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  limit?: number;
}

export class SaveQueryDto {
  @IsString()
  name: string;

  @IsObject()
  params: Record<string, unknown>;
}
