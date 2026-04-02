import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { CampaignsService } from './campaigns.service';
import {
  CreateCampaignDto,
  UpdateCampaignDto,
  CampaignFiltersDto,
  SensitiveWordDto,
} from './dto/campaign.dto';
import { JwtAuthGuard, JwtPayload } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('campaigns')
export class CampaignsPublicController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get('active')
  findActive() {
    return this.campaignsService.findActive();
  }
}

@Controller('admin/campaigns')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminCampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  findAll(@Query() filters: CampaignFiltersDto) {
    return this.campaignsService.findAll(filters);
  }

  @Post()
  create(@Body() dto: CreateCampaignDto, @Req() req: Request) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.campaignsService.create(dto, user.sub);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCampaignDto,
    @Req() req: Request,
  ) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.campaignsService.update(id, dto, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.campaignsService.softDelete(id, user.sub);
  }
}

@Controller('admin/sensitive-words')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminSensitiveWordsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  findAll() {
    return this.campaignsService.getSensitiveWords();
  }

  @Post()
  add(@Body() dto: SensitiveWordDto, @Req() req: Request) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.campaignsService.addSensitiveWord(dto, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.campaignsService.removeSensitiveWord(id, user.sub);
  }
}
