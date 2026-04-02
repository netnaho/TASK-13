import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { QueryService } from './query.service';
import { PowerQueryDto, SaveQueryDto } from './dto/query.dto';
import { JwtAuthGuard, JwtPayload } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('query')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'vendor')
export class QueryController {
  constructor(private readonly queryService: QueryService) {}

  @Post()
  execute(@Body() dto: PowerQueryDto, @Req() req: Request) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.queryService.execute(dto, user.sub, user.role);
  }

  @Post('save')
  save(@Body() dto: SaveQueryDto, @Req() req: Request) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.queryService.saveQuery(user.sub, dto.name, dto.params);
  }

  @Get('saved')
  getSaved(@Req() req: Request) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.queryService.getSavedQueries(user.sub);
  }

  @Delete('saved/:id')
  @HttpCode(HttpStatus.OK)
  deleteSaved(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.queryService.deleteSavedQuery(id, user.sub);
  }
}
