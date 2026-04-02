import {
  IsString,
  IsEnum,
  IsDateString,
  IsNumber,
  IsOptional,
  IsObject,
  IsIn,
  Min,
  Max,
  ValidateIf,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { CampaignType, CampaignStatus } from '../../database/entities/campaign.entity';

export class CreateCampaignDto {
  @IsString()
  title: string;

  @IsEnum(CampaignType)
  type: CampaignType;

  @IsDateString()
  startTime: string;

  @IsDateString()
  endTime: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  @Type(() => Number)
  slotIndex?: number;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @IsOptional()
  @IsIn(['draft', 'active'])
  status?: string;
}

export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  @Type(() => Number)
  slotIndex?: number;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}

export class CampaignFiltersDto {
  @IsOptional()
  @IsEnum(CampaignType)
  type?: CampaignType;

  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class SensitiveWordDto {
  @IsString()
  word: string;
}
