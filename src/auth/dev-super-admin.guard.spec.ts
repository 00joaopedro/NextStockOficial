import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { DevSuperAdminGuard } from './dev-super-admin.guard';

describe('DevSuperAdminGuard', () => {
  function contextWithUser(user?: Record<string, unknown>) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as any;
  }

  beforeEach(() => {
    process.env.DEV_SUPER_ADMIN_EMAILS = '';
    process.env.DEV_SUPER_ADMIN_USER_IDS = '';
  });

  it('sem JWT/usuario autenticado recebe 401', () => {
    const guard = new DevSuperAdminGuard();

    expect(() => guard.canActivate(contextWithUser())).toThrow(
      UnauthorizedException,
    );
  });

  it('admin padrao recebe 403', () => {
    const guard = new DevSuperAdminGuard();

    expect(() =>
      guard.canActivate(
        contextWithUser({
          id: 'admin-id',
          email: 'admin@example.com',
          role: 'Admin',
          isSuperAdmin: false,
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('superAdmin nao listado na allowlist recebe 403', () => {
    const guard = new DevSuperAdminGuard();

    expect(() =>
      guard.canActivate(
        contextWithUser({
          id: 'super-id',
          email: 'super@example.com',
          role: 'superAdmin',
          isSuperAdmin: true,
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('Dev SuperAdmin listado em DEV_SUPER_ADMIN_EMAILS recebe acesso', () => {
    process.env.DEV_SUPER_ADMIN_EMAILS = 'dev@example.com';
    const guard = new DevSuperAdminGuard();

    expect(
      guard.canActivate(
        contextWithUser({
          id: 'dev-id',
          email: 'DEV@example.com',
          role: 'superAdmin',
          isSuperAdmin: true,
        }),
      ),
    ).toBe(true);
  });

  it('Dev SuperAdmin listado em DEV_SUPER_ADMIN_USER_IDS recebe acesso', () => {
    process.env.DEV_SUPER_ADMIN_USER_IDS = 'dev-id';
    const guard = new DevSuperAdminGuard();

    expect(
      guard.canActivate(
        contextWithUser({
          id: 'dev-id',
          email: 'super@example.com',
          role: 'superAdmin',
          isSuperAdmin: true,
        }),
      ),
    ).toBe(true);
  });
});
