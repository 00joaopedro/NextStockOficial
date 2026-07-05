import { UnauthorizedException } from '@nestjs/common';
import { SessionsService } from './sessions.service';

describe('SessionsService', () => {
  beforeEach(() => {
    process.env.SESSION_HASH_SECRET = 's'.repeat(32);
    process.env.SESSION_ENFORCEMENT_ENABLED = 'true';
  });

  afterEach(() => {
    process.env.SESSION_ENFORCEMENT_ENABLED = 'false';
  });

  it('creates only a hash and validates an active session', async () => {
    const stored: any = {};
    const prisma = {
      userSession: {
        create: jest.fn(({ data }) => {
          Object.assign(stored, data, {
            id: 'session-1',
            lastSeenAt: new Date(),
          });
          return { id: 'session-1', expiresAt: data.expiresAt };
        }),
        findUnique: jest.fn(() => ({
          id: 'session-1',
          profileId: 'profile-1',
          expiresAt: stored.expiresAt,
          revokedAt: null,
          lastSeenAt: new Date(),
        })),
        update: jest.fn(),
      },
    };
    const service = new SessionsService(prisma as any);
    const created = await service.create({
      profileId: 'profile-1',
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(stored.tokenIdHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(created.token);
    await expect(
      service.assertActive(created.token, 'profile-1'),
    ).resolves.toMatchObject({ id: 'session-1' });
  });

  it('rejects revoked or expired sessions', async () => {
    const service = new SessionsService({
      userSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          profileId: 'profile-1',
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: new Date(),
          lastSeenAt: new Date(),
        }),
      },
    } as any);
    await expect(
      service.assertActive('opaque', 'profile-1'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revokes current and all sessions', async () => {
    const prisma = {
      userSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const service = new SessionsService(prisma as any);
    await expect(service.revokeCurrent('opaque')).resolves.toBe(2);
    await expect(
      service.revokeAllForProfile('profile-1', 'logout_all'),
    ).resolves.toBe(2);
    expect(prisma.userSession.updateMany).toHaveBeenCalledTimes(2);
  });
});
