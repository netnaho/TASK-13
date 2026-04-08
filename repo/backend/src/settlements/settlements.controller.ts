import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  Res,
  UseGuards,
  ParseUUIDPipe,
  Header,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { SettlementsService } from './settlements.service';
import { FreightService, FreightParams } from './freight.service';
import {
  GenerateMonthlyDto,
  FreightCalcDto,
  RejectDto,
  SettlementFiltersDto,
  ReconcileDto,
} from './dto/settlement.dto';
import { JwtAuthGuard, JwtPayload } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('settlements')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettlementsController {
  constructor(
    private readonly settlementsService: SettlementsService,
    private readonly freightService: FreightService,
  ) {}

  @Get()
  @Roles('admin', 'vendor', 'ops_reviewer', 'finance_admin')
  findAll(@Query() filters: SettlementFiltersDto, @Req() req: Request) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.settlementsService.findAll(user.sub, user.role, filters);
  }

  @Get(':id')
  @Roles('admin', 'vendor', 'ops_reviewer', 'finance_admin')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.settlementsService.findOne(id, user.sub, user.role);
  }

  @Post('generate-monthly')
  @Roles('admin')
  generateMonthly(@Body() dto: GenerateMonthlyDto, @Req() req: Request) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.settlementsService.generateMonthly(dto.month, user.sub, 'manual');
  }

  @Post('freight/calculate')
  @Roles('admin', 'vendor')
  calculateFreight(@Body() dto: FreightCalcDto) {
    return this.freightService.calculate(dto as FreightParams);
  }

  @Post(':id/approve-step1')
  @Roles('ops_reviewer')
  approveStep1(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.settlementsService.approveStep1(id, user.sub, user.role);
  }

  @Post(':id/approve-step2')
  @Roles('finance_admin')
  approveStep2(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.settlementsService.approveStep2(id, user.sub, user.role);
  }

  @Post(':id/reject')
  @Roles('ops_reviewer', 'finance_admin', 'admin')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectDto,
    @Req() req: Request,
  ) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.settlementsService.reject(id, user.sub, user.role, dto.reason);
  }

  @Post(':id/reconcile')
  @Roles('admin', 'finance_admin')
  reconcile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReconcileDto,
    @Req() req: Request,
  ) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.settlementsService.recordActualCharges(id, dto.actualCharges, user.sub, dto.notes);
  }

  @Get('export/:id')
  @Roles('admin', 'vendor', 'ops_reviewer', 'finance_admin')
  async exportCsv(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const user = (req as Request & { user: JwtPayload }).user;
    const csv = await this.settlementsService.exportCsv(
      id,
      user.sub,
      user.role,
      user.username,
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="settlement-${id}.csv"`);
    res.send(csv);
  }
}
