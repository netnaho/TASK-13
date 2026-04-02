import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
  ParseUUIDPipe,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { IsOptional, IsString, IsDateString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { AuditService } from './audit.service';
import { JwtAuthGuard, JwtPayload } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

class AuditQueryDto {
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  limit?: number;
}

class AdminAuditFiltersDto {
  @IsOptional()
  @IsString()
  actorId?: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  limit?: number;
}

class ExportAuditDto {
  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  findAll(@Query() query: AuditQueryDto) {
    return this.auditService.findAll(query.page ?? 1, query.limit ?? 50);
  }
}

@Controller('admin/audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminAuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  findAllFiltered(@Query() filters: AdminAuditFiltersDto) {
    return this.auditService.findAllFiltered(filters);
  }

  @Get(':id/verify')
  async verify(@Param('id', ParseUUIDPipe) id: string) {
    try {
      return await this.auditService.verifyEntry(id);
    } catch {
      throw new NotFoundException('Audit entry not found');
    }
  }

  @Post('export')
  async exportAudit(@Body() dto: ExportAuditDto, @Req() req: Request) {
    const user = (req as Request & { user: JwtPayload }).user;
    const { DataSource } = await import('typeorm');
    const exportRepo = this.auditService['auditRepo'].manager.getRepository('ExportJob');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const job = exportRepo.create({
      requesterId: user.sub,
      status: 'queued',
      params: { type: 'audit', filters: dto },
      expiresAt,
    });
    return exportRepo.save(job);
  }
}
