import { IsString } from 'class-validator';

export class CreateCannedResponseDto {
  @IsString()
  title: string;

  @IsString()
  body: string;
}
