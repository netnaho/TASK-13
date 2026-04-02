import { IsString, IsOptional, IsIn, IsBoolean, MaxLength } from 'class-validator';

export class SendMessageDto {
  @IsIn(['text', 'voice'])
  type: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;

  @IsOptional()
  @IsString()
  audioUrl?: string;

  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}
