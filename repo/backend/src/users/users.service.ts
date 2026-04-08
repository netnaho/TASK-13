import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../database/entities/user.entity';
import { UserSanitizerService } from '../common/sanitization/user-sanitizer.service';
import { UserView } from '../common/sanitization/user-view.model';
import { AuditService } from '../audit/audit.service';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly sanitizer: UserSanitizerService,
    private readonly auditService: AuditService,
  ) {}

  async findById(id: string, requesterRole: string): Promise<UserView> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.sanitizer.sanitize(user, requesterRole);
  }

  /**
   * Admin-only: list all users (paginated, sanitized for admin view).
   */
  async findAll(
    page = 1,
    limit = 50,
  ): Promise<{ items: UserView[]; total: number }> {
    const [users, total] = await this.userRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: users.map((u) => this.sanitizer.sanitize(u, 'admin')),
      total,
    };
  }

  /**
   * Admin-only: assign or change the role of an existing user.
   *
   * Supports promoting users to ops_reviewer or finance_admin for the two-step
   * settlement approval workflow.  The change is audit-logged for accountability.
   */
  async updateRole(
    targetId: string,
    dto: UpdateRoleDto,
    adminId: string,
  ): Promise<UserView> {
    const user = await this.userRepo.findOne({ where: { id: targetId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const previousRole = user.role;
    user.role = dto.role;
    const saved = await this.userRepo.save(user);

    await this.auditService.log({
      action: 'user.role_changed',
      actorId: adminId,
      entityType: 'user',
      entityId: targetId,
      before: { role: previousRole } as unknown as Record<string, unknown>,
      after: { role: dto.role } as unknown as Record<string, unknown>,
    });

    return this.sanitizer.sanitize(saved, 'admin');
  }

  /**
   * Admin-only: activate or deactivate a user account.
   */
  async setActive(
    targetId: string,
    isActive: boolean,
    adminId: string,
  ): Promise<UserView> {
    const user = await this.userRepo.findOne({ where: { id: targetId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.isActive = isActive;
    const saved = await this.userRepo.save(user);

    await this.auditService.log({
      action: isActive ? 'user.activated' : 'user.deactivated',
      actorId: adminId,
      entityType: 'user',
      entityId: targetId,
      after: { isActive } as unknown as Record<string, unknown>,
    });

    return this.sanitizer.sanitize(saved, 'admin');
  }
}
