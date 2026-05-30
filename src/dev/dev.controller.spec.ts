import { ForbiddenException } from '@nestjs/common';
import { DevController } from './dev.controller';

describe('DevController', () => {
  const devService = {
    getOverview: jest.fn(),
    getUsersUsage: jest.fn(),
    getHealth: jest.fn(),
  } as any;

  let controller: DevController;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DEV_SUPER_ADMIN_EMAILS = '';
    process.env.DEV_SUPER_ADMIN_USER_IDS = '';
    controller = new DevController(devService);
  });

  it('bloqueia user comum', () => {
    expect(() =>
      controller.getHealth({
        user: { role: 'Admin', isSuperAdmin: false },
      } as any),
    ).toThrow(ForbiddenException);
  });

  it('bloqueia superAdmin nao listado na allowlist Dev', () => {
    expect(() =>
      controller.getHealth({
        user: {
          id: 'super-id',
          email: 'super@example.com',
          role: 'superAdmin',
          isSuperAdmin: true,
        },
      } as any),
    ).toThrow(ForbiddenException);
  });

  it('permite Dev SuperAdmin listado por email', async () => {
    process.env.DEV_SUPER_ADMIN_EMAILS = 'dev@example.com';
    devService.getHealth.mockResolvedValue({
      ok: true,
      railwayConfigured: true,
      supabaseConfigured: true,
      databaseConnected: true,
    });

    await expect(
      controller.getHealth({
        user: {
          id: 'super-id',
          email: 'dev@example.com',
          role: 'superAdmin',
          isSuperAdmin: true,
        },
      } as any),
    ).resolves.toEqual({
      ok: true,
      railwayConfigured: true,
      supabaseConfigured: true,
      databaseConnected: true,
    });
  });

  it('permite Dev SuperAdmin listado por id', async () => {
    process.env.DEV_SUPER_ADMIN_USER_IDS = 'super-id';
    devService.getHealth.mockResolvedValue({ ok: true });

    await expect(
      controller.getHealth({
        user: {
          id: 'super-id',
          email: 'super@example.com',
          role: 'superAdmin',
          isSuperAdmin: true,
        },
      } as any),
    ).resolves.toEqual({ ok: true });
  });
});
