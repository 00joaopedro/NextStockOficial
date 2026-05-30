import { canAccessDev, isDevSuperAdmin, parseAllowlistEnv } from './super-admin.util';

describe('super-admin util', () => {
  beforeEach(() => {
    process.env.DEV_SUPER_ADMIN_EMAILS = '';
    process.env.DEV_SUPER_ADMIN_USER_IDS = '';
  });

  it('parseAllowlistEnv normaliza lista separada por virgula', () => {
    expect(parseAllowlistEnv(' Dev@Email.com, outro@Email.com ,, ')).toEqual([
      'dev@email.com',
      'outro@email.com',
    ]);
  });

  it('bloqueia Dev quando allowlist esta vazia', () => {
    expect(
      canAccessDev({
        id: 'dev-id',
        email: 'dev@example.com',
        role: 'superAdmin',
        isSuperAdmin: true,
      }),
    ).toBe(false);
  });

  it('exige superAdmin alem da allowlist', () => {
    process.env.DEV_SUPER_ADMIN_EMAILS = 'dev@example.com';

    expect(
      isDevSuperAdmin({
        id: 'dev-id',
        email: 'dev@example.com',
        role: 'Admin',
        isSuperAdmin: false,
      }),
    ).toBe(false);
  });

  it('permite Dev SuperAdmin por email', () => {
    process.env.DEV_SUPER_ADMIN_EMAILS = ' dev@example.com ';

    expect(
      canAccessDev({
        id: 'dev-id',
        email: 'DEV@example.com',
        role: 'superAdmin',
        isSuperAdmin: true,
      }),
    ).toBe(true);
  });

  it('permite Dev SuperAdmin por id do profile ou Supabase', () => {
    process.env.DEV_SUPER_ADMIN_USER_IDS = 'profile-id, supabase-id';

    expect(
      canAccessDev({
        id: 'profile-id',
        email: 'dev@example.com',
        role: 'superAdmin',
        isSuperAdmin: true,
      }),
    ).toBe(true);

    expect(
      canAccessDev({
        id: 'other-id',
        supabaseUserId: 'supabase-id',
        email: 'dev@example.com',
        role: 'superAdmin',
        isSuperAdmin: true,
      }),
    ).toBe(true);
  });
});
