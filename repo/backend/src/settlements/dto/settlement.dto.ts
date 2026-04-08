import { IsString, IsOptional, IsIn, IsNumber, IsBoolean, Matches } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class GenerateMonthlyDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be YYYY-MM format' })
  month: string;
}

export class FreightCalcDto {
  @IsNumber()
  @Type(() => Number)
  distanceMiles: number;

  @IsNumber()
  @Type(() => Number)
  weightLbs: number;

  @IsNumber()
  @Type(() => Number)
  dimWeightLbs: number;

  @IsBoolean()
  isOversized: boolean;

  @IsBoolean()
  isWeekend: boolean;
}

export class RejectDto {
  @IsString()
  reason: string;
}

export class ReconcileDto {
  @IsNumber()
  @Type(() => Number)
  actualCharges: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class SettlementFiltersDto {
  @IsOptional()
  @IsString()
  month?: string;

  @IsOptional()
  @IsIn(['pending', 'reviewer_approved', 'finance_approved', 'rejected'])
  status?: string;
}
