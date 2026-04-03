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
import { ListingsService } from './listings.service';
import { SearchListingsDto, SuggestDto } from './dto/search-listings.dto';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { JwtAuthGuard, JwtPayload } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { extractRiskContext } from '../common/risk/request-risk-context';

@Controller('listings')
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Get()
  search(@Query() query: SearchListingsDto) {
    return this.listingsService.search(query);
  }

  @Get('suggest')
  suggest(@Query() query: SuggestDto) {
    return this.listingsService.suggest(query.q ?? '');
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const user = (req as Request & { user?: JwtPayload }).user;
    return this.listingsService.findOne(id, user?.role, user?.sub);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('vendor', 'admin')
  create(@Body() dto: CreateListingDto, @Req() req: Request) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.listingsService.create(user.sub, dto, extractRiskContext(req));
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('vendor', 'admin')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateListingDto,
    @Req() req: Request,
  ) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.listingsService.update(id, user.sub, user.role, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('vendor', 'admin')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.listingsService.softDelete(id, user.sub, user.role);
  }
}
