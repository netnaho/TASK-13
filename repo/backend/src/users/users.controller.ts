import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { UsersService } from './users.service';
import { UpdateRoleDto } from './dto/update-role.dto';
import { JwtAuthGuard, JwtPayload } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /users/me — returns the authenticated user's own profile.
   */
  @Get('me')
  getMe(@Req() req: Request) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.usersService.findById(user.sub, user.role);
  }

  /**
   * GET /users — admin-only paginated list of all users.
   */
  @Get()
  @UseGuards(RolesGuard)
  @Roles('admin')
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.usersService.findAll(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  /**
   * PATCH /users/:id/role — admin-only role assignment.
   *
   * Used to promote a registered user to ops_reviewer or finance_admin so they
   * can participate in the two-step settlement approval workflow.
   */
  @Patch(':id/role')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @Req() req: Request,
  ) {
    const admin = (req as Request & { user: JwtPayload }).user;
    return this.usersService.updateRole(id, dto, admin.sub);
  }

  /**
   * PATCH /users/:id/active — admin-only account activation/deactivation.
   */
  @Patch(':id/active')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  setActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('isActive') isActive: boolean,
    @Req() req: Request,
  ) {
    const admin = (req as Request & { user: JwtPayload }).user;
    return this.usersService.setActive(id, isActive, admin.sub);
  }
}
