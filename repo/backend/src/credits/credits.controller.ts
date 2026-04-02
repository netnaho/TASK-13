import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { CreditsService } from './credits.service';
import { JwtAuthGuard, JwtPayload } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('credits')
@UseGuards(JwtAuthGuard)
export class CreditsController {
  constructor(private readonly creditsService: CreditsService) {}

  @Get('me')
  getMyScore(@Req() req: Request) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.creditsService.getScore(user.sub, user.sub, user.role);
  }

  @Get(':userId')
  getScore(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() req: Request,
  ) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.creditsService.getScore(userId, user.sub, user.role);
  }

  @Post('compute/:userId')
  @UseGuards(RolesGuard)
  @Roles('admin')
  compute(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.creditsService.computeScore(userId);
  }
}
