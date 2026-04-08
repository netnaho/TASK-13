import { IsString, IsOptional, IsObject, IsIn } from 'class-validator';

export const EXPORT_ALLOWED_TYPES = ['listings', 'conversations', 'settlements', 'audit'] as const;
export type ExportType = typeof EXPORT_ALLOWED_TYPES[number];

export class CreateExportJobDto {
  @IsIn(EXPORT_ALLOWED_TYPES)
  type: string;

  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;
}
