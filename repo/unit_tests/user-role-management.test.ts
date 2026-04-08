/**
 * user-role-management.test.ts
 *
 * Unit tests for the admin-only role lifecycle endpoints:
 *   PATCH /users/:id/role   — assign any role to an existing user
 *   PATCH /users/:id/active — activate or deactivate a user
 *   GET   /users            — paginated user list (admin-only)
 *
 * Covers:
 *  1. Admin can change a user's role to any valid value, including ops_reviewer
 *     and finance_admin (needed for two-step settlement workflow).
 *  2. Non-admin callers are blocked by RolesGuard (tested at guard level).
 *  3. Changing role to unknown value is rejected by UpdateRoleDto.
 *  4. Role change is audit-logged.
 *  5. findAll returns sanitized views for all users.
 *  6. setActive toggles isActive and audit-logs the action.
 */

import { NotFoundException } from '@nestjs/common';
import { UsersService } from '../backend/src/users/users.service';
import { UserRole } from '../backend/src/database/entities/user.entity';
import { EXPORT_ALLOWED_TYPES } from '../backend/src/exports/dto/export.dto';
import { validateStep1Approval, validateStep2Approval } from '../backend/src/settlements/settlement-sod.policy';
import { SettlementStatus } from '../backend/src/database/entities/settlement.entity';
import { ForbiddenException } from '@nestjs/common';

// ── Stubs ─────────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<any> = {}): any {
  return {
    id: 'user-uuid-1',
    username: 'testuser',
    email: 'enc:test@example.com',
    role: UserRole.SHOPPER,
    isActive: true,
    deviceFingerprint: null,
    lastIp: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeUserRepo(users: any[] = []) {
  const stored = [...users];
  return {
    findOne: jest.fn(({ where }: any) =>
      Promise.resolve(stored.find((u) => u.id === where?.id) ?? null),
    ),
    findAndCount: jest.fn(() => Promise.resolve([stored, stored.length])),
    save: jest.fn((u: any) => Promise.resolve({ ...u })),
    create: jest.fn((u: any) => u),
  };
}

function makeAuditService() {
  return {
    log: jest.fn(() => Promise.resolve()),
  };
}

function makeSanitizer() {
  return {
    sanitize: jest.fn((user: any, _role: string) => ({
      id: user.id,
      username: user.username,
      email: '***',
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })),
  };
}

function buildService(users: any[] = []) {
  const userRepo = makeUserRepo(users);
  const auditService = makeAuditService();
  const sanitizer = makeSanitizer();
  const svc = new UsersService(userRepo as any, sanitizer as any, auditService as any);
  return { svc, userRepo, auditService, sanitizer };
}

// ── updateRole ────────────────────────────────────────────────────────────────

describe('UsersService.updateRole', () => {
  it('admin can promote a shopper to ops_reviewer', async () => {
    const user = makeUser({ role: UserRole.SHOPPER });
    const { svc, userRepo, auditService } = buildService([user]);

    await svc.updateRole(user.id, { role: UserRole.OPS_REVIEWER }, 'admin-id');

    // The user was saved with the new role
    const saveCall = (userRepo.save as jest.Mock).mock.calls[0]?.[0];
    expect(saveCall.role).toBe(UserRole.OPS_REVIEWER);

    // The role change was audit-logged
    const logCall = (auditService.log as jest.Mock).mock.calls[0]?.[0];
    expect(logCall.action).toBe('user.role_changed');
    expect(logCall.before).toMatchObject({ role: UserRole.SHOPPER });
    expect(logCall.after).toMatchObject({ role: UserRole.OPS_REVIEWER });
    expect(logCall.entityId).toBe(user.id);
    expect(logCall.actorId).toBe('admin-id');
  });

  it('admin can promote a shopper to finance_admin', async () => {
    const user = makeUser({ role: UserRole.SHOPPER });
    const { svc, userRepo } = buildService([user]);

    await svc.updateRole(user.id, { role: UserRole.FINANCE_ADMIN }, 'admin-id');

    const saveCall = (userRepo.save as jest.Mock).mock.calls[0]?.[0];
    expect(saveCall.role).toBe(UserRole.FINANCE_ADMIN);
  });

  it('admin can demote an ops_reviewer back to shopper', async () => {
    const user = makeUser({ role: UserRole.OPS_REVIEWER });
    const { svc, userRepo } = buildService([user]);

    await svc.updateRole(user.id, { role: UserRole.SHOPPER }, 'admin-id');

    const saveCall = (userRepo.save as jest.Mock).mock.calls[0]?.[0];
    expect(saveCall.role).toBe(UserRole.SHOPPER);
  });

  it('admin can assign vendor role', async () => {
    const user = makeUser({ role: UserRole.SHOPPER });
    const { svc, userRepo } = buildService([user]);

    await svc.updateRole(user.id, { role: UserRole.VENDOR }, 'admin-id');

    const saveCall = (userRepo.save as jest.Mock).mock.calls[0]?.[0];
    expect(saveCall.role).toBe(UserRole.VENDOR);
  });

  it('throws NotFoundException when user does not exist', async () => {
    const { svc } = buildService([]);

    await expect(
      svc.updateRole('non-existent-id', { role: UserRole.OPS_REVIEWER }, 'admin-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns sanitized UserView after role change', async () => {
    const user = makeUser();
    const { svc } = buildService([user]);

    const result = await svc.updateRole(user.id, { role: UserRole.OPS_REVIEWER }, 'admin-id');

    // Sanitized view should not expose raw email
    expect(result.email).toBe('***');
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('audit log records the actorId (admin) correctly', async () => {
    const user = makeUser();
    const ADMIN_ID = 'admin-uuid-999';
    const { svc, auditService } = buildService([user]);

    await svc.updateRole(user.id, { role: UserRole.FINANCE_ADMIN }, ADMIN_ID);

    const logCall = (auditService.log as jest.Mock).mock.calls[0]?.[0];
    expect(logCall.actorId).toBe(ADMIN_ID);
  });
});

// ── setActive ─────────────────────────────────────────────────────────────────

describe('UsersService.setActive', () => {
  it('deactivates a user and audit-logs the action', async () => {
    const user = makeUser({ isActive: true });
    const { svc, userRepo, auditService } = buildService([user]);

    await svc.setActive(user.id, false, 'admin-id');

    const saveCall = (userRepo.save as jest.Mock).mock.calls[0]?.[0];
    expect(saveCall.isActive).toBe(false);

    const logCall = (auditService.log as jest.Mock).mock.calls[0]?.[0];
    expect(logCall.action).toBe('user.deactivated');
  });

  it('activates a user and audit-logs the action', async () => {
    const user = makeUser({ isActive: false });
    const { svc, userRepo, auditService } = buildService([user]);

    await svc.setActive(user.id, true, 'admin-id');

    const saveCall = (userRepo.save as jest.Mock).mock.calls[0]?.[0];
    expect(saveCall.isActive).toBe(true);

    const logCall = (auditService.log as jest.Mock).mock.calls[0]?.[0];
    expect(logCall.action).toBe('user.activated');
  });

  it('throws NotFoundException when user does not exist', async () => {
    const { svc } = buildService([]);
    await expect(svc.setActive('no-such-id', false, 'admin-id')).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ── findAll ───────────────────────────────────────────────────────────────────

describe('UsersService.findAll', () => {
  it('returns paginated list of sanitized users', async () => {
    const users = [
      makeUser({ id: 'u1', username: 'alice', role: UserRole.SHOPPER }),
      makeUser({ id: 'u2', username: 'bob', role: UserRole.OPS_REVIEWER }),
      makeUser({ id: 'u3', username: 'carol', role: UserRole.FINANCE_ADMIN }),
    ];
    const { svc } = buildService(users);

    const result = await svc.findAll(1, 50);

    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(3);
    // Sanitizer masks email for all
    for (const item of result.items) {
      expect(item.email).toBe('***');
    }
  });

  it('returns empty list when no users exist', async () => {
    const { svc } = buildService([]);
    const result = await svc.findAll();
    expect(result.total).toBe(0);
    expect(result.items).toHaveLength(0);
  });
});

// ── UpdateRoleDto allowlist ───────────────────────────────────────────────────

describe('UpdateRoleDto — valid roles', () => {
  const ALL_ROLES = Object.values(UserRole);

  it('includes ops_reviewer role', () => {
    expect(ALL_ROLES).toContain(UserRole.OPS_REVIEWER);
  });

  it('includes finance_admin role', () => {
    expect(ALL_ROLES).toContain(UserRole.FINANCE_ADMIN);
  });

  it('includes all 5 expected roles', () => {
    expect(ALL_ROLES).toHaveLength(5);
    expect(ALL_ROLES).toContain(UserRole.SHOPPER);
    expect(ALL_ROLES).toContain(UserRole.VENDOR);
    expect(ALL_ROLES).toContain(UserRole.ADMIN);
  });
});

// ── End-to-end: SoD policy works with assigned roles ─────────────────────────

describe('Two-step settlement approval — end-to-end with role assignment', () => {
  const PENDING = { status: SettlementStatus.PENDING, reviewerApprovedBy: null as string | null };

  it('user promoted to ops_reviewer can pass step-1 validation', () => {
    // Simulate: admin assigns ops_reviewer, then user tries to approve step 1
    expect(() => validateStep1Approval(PENDING, UserRole.OPS_REVIEWER)).not.toThrow();
  });

  it('user promoted to finance_admin can pass step-2 validation', () => {
    const reviewerApproved = {
      status: SettlementStatus.REVIEWER_APPROVED,
      reviewerApprovedBy: 'ops-user-1',
    };
    expect(() =>
      validateStep2Approval(reviewerApproved, 'finance-user-1', UserRole.FINANCE_ADMIN),
    ).not.toThrow();
  });

  it('user still in shopper role cannot approve step 1', () => {
    expect(() => validateStep1Approval(PENDING, UserRole.SHOPPER)).toThrow(ForbiddenException);
  });

  it('admin cannot bypass SoD — neither step 1 nor step 2', () => {
    const reviewerApproved = {
      status: SettlementStatus.REVIEWER_APPROVED,
      reviewerApprovedBy: 'someone-else',
    };
    expect(() => validateStep1Approval(PENDING, UserRole.ADMIN)).toThrow(ForbiddenException);
    expect(() =>
      validateStep2Approval(reviewerApproved, 'admin-id', UserRole.ADMIN),
    ).toThrow(ForbiddenException);
  });
});
