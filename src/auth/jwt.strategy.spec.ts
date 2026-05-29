jest.mock('jwks-rsa', () => ({
  passportJwtSecret: jest.fn(() => jest.fn()),
}));

import { Role, SystemMode, SystemType } from '@prisma/client';
import { cookieExtractor, decodeJwtHeader, JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const tenant = {
    id: 'tenant-id',
    name: 'Empresa',
    slug: 'empresa',
    systemType: SystemType.padrao,
    mode: SystemMode.padrao,
  };
  const branch = {
    id: 'branch-id',
    name: 'Matriz',
    slug: 'matriz',
  };
  const profile = {
    id: 'profile-id',
    supabaseUserId: 'auth-user-id',
    email: 'user@test.com',
    name: 'User Teste',
    fullName: 'User Teste',
    role: Role.Admin,
    systemType: SystemType.padrao,
    allowedSystemTypes: [SystemType.padrao],
    isSuperAdmin: false,
    tenantId: tenant.id,
    primaryTenantId: tenant.id,
    memberships: [
      {
        role: Role.Admin,
        tenant,
        branch,
      },
    ],
  };

  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = 'test-secret';
  });

  it('cookieExtractor extrai req.cookies.jwt', () => {
    expect(cookieExtractor({ cookies: { jwt: 'abc.def.ghi' } } as any)).toBe(
      'abc.def.ghi',
    );
  });

  it('decodeJwtHeader le algoritmo sem expor token completo', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
      .toString('base64url');

    expect(decodeJwtHeader(`${header}.payload.signature`)).toMatchObject({
      alg: 'HS256',
      typ: 'JWT',
    });
  });

  it('validate aceita payload com sub/email e retorna usuario autenticado', async () => {
    const prisma = {
      userProfile: {
        findFirst: jest.fn().mockResolvedValue(profile),
        update: jest.fn(),
      },
    };
    const strategy = new JwtStrategy(prisma as any);

    await expect(
      strategy.validate({ sub: 'auth-user-id', email: 'user@test.com' }),
    ).resolves.toMatchObject({
      id: profile.id,
      tenantId: tenant.id,
      branchId: branch.id,
      systemType: SystemType.padrao,
    });
  });

  it('validate vincula profile encontrado por email quando supabaseUserId esta ausente', async () => {
    const prisma = {
      userProfile: {
        findFirst: jest.fn().mockResolvedValue({
          ...profile,
          supabaseUserId: null,
          email: 'user@test.com',
        }),
        update: jest.fn().mockResolvedValue({ id: profile.id }),
      },
    };
    const strategy = new JwtStrategy(prisma as any);

    await strategy.validate({ sub: 'auth-user-id', email: 'user@test.com' });

    expect(prisma.userProfile.update).toHaveBeenCalledWith({
      where: { id: profile.id },
      data: { supabaseUserId: 'auth-user-id' },
      select: { id: true },
    });
  });

  it('validate nao bloqueia superAdmin sem tenant/membership como usuario comum', async () => {
    const prisma = {
      userProfile: {
        findFirst: jest.fn().mockResolvedValue({
          ...profile,
          role: Role.superAdmin,
          isSuperAdmin: true,
          tenantId: null,
          primaryTenantId: null,
          memberships: [],
        }),
        update: jest.fn(),
      },
    };
    const strategy = new JwtStrategy(prisma as any);

    await expect(
      strategy.validate({ sub: 'super-auth-id', email: 'dev@test.com' }),
    ).resolves.toMatchObject({
      role: Role.superAdmin,
      isSuperAdmin: true,
      tenantId: null,
    });
  });
});
