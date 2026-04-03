import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  Res,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as fs from 'fs';
import { ExportsService } from './exports.service';
import { CreateExportJobDto } from './dto/export.dto';
import { JwtAuthGuard, JwtPayload } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('exports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Get('jobs')
  @Roles('admin', 'vendor', 'ops_reviewer', 'finance_admin')
  findAll(@Req() req: Request) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.exportsService.findAll(user.sub, user.role);
  }

  @Post('jobs')
  @Roles('admin', 'vendor', 'ops_reviewer', 'finance_admin')
  createJob(@Body() dto: CreateExportJobDto, @Req() req: Request) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.exportsService.createJob(user.sub, user.role, dto);
  }

  @Get('jobs/:id')
  @Roles('admin', 'vendor', 'ops_reviewer', 'finance_admin')
  getStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.exportsService.getJobStatus(id, user.sub, user.role);
  }

  @Get('jobs/:id/download')
  @Roles('admin', 'vendor', 'ops_reviewer', 'finance_admin')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const user = (req as Request & { user: JwtPayload }).user;
    const { filePath, fileName } = await this.exportsService.downloadFile(
      id,
      user.sub,
      user.role,
    );

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ code: 404, msg: 'File not found on disk', timestamp: new Date().toISOString() });
      return;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    fs.createReadStream(filePath).pipe(res);
  }
}
