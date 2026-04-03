import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { UsersService } from './users.service';
import { JwtAuthGuard, JwtPayload } from '../common/guards/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@Req() req: Request) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.usersService.findById(user.sub, user.role);
  }
}
