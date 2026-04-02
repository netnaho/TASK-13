import { IsString, IsOptional, IsObject, IsIn } from 'class-validator';

export class CreateExportJobDto {
  @IsIn(['listings', 'conversations', 'settlements', 'audit'])
  type: string;

  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;
}
