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
    controller = new DevController(devService);
  });

  it('bloqueia user comum', () => {
    expect(() =>
      controller.getHealth({
        user: { role: 'Admin', isSuperAdmin: false },
      } as any),
    ).toThrow(ForbiddenException);
  });

  it('permite superAdmin', async () => {
    devService.getHealth.mockResolvedValue({
      ok: true,
      railwayConfigured: true,
      supabaseConfigured: true,
      databaseConnected: true,
    });

    await expect(
      controller.getHealth({
        user: { role: 'superAdmin', isSuperAdmin: true },
      } as any),
    ).resolves.toEqual({
      ok: true,
      railwayConfigured: true,
      supabaseConfigured: true,
      databaseConnected: true,
    });
  });
});
