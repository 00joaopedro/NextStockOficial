import { AuditContextKind, AuditOutcome } from '@prisma/client';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  it('writes only sanitized append-only event data', async () => {
    process.env.AUDIT_HASH_SECRET = 'b'.repeat(32);
    const prisma = {
      securityAuditEvent: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };
    const service = new AuditService(prisma as any);

    await service.record({
      eventType: 'auth.login.failed',
      action: 'login',
      outcome: AuditOutcome.DENIED,
      ip: '127.0.0.1',
      metadata: {
        password: 'secret',
        cookie: 'jwt=secret',
        reason: 'invalid',
      },
    });

    expect(prisma.securityAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'auth.login.failed',
        ipHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        metadata: { reason: 'invalid' },
      }),
    });
    expect(
      JSON.stringify(prisma.securityAuditEvent.create.mock.calls),
    ).not.toContain('jwt=secret');
  });

  it('is best-effort when persistence fails', async () => {
    const service = new AuditService({
      securityAuditEvent: {
        create: jest.fn().mockRejectedValue({ code: 'P1001' }),
      },
    } as any);

    await expect(
      service.record({
        eventType: 'test',
        action: 'test',
        outcome: AuditOutcome.FAILED,
      }),
    ).resolves.toBeNull();
  });

  it('extracts request metadata without Express request.header()', () => {
    const service = new AuditService({} as any);

    expect(
      service.fromRequest({
        headers: {
          'x-forwarded-for': '203.0.113.10, 10.0.0.1',
          'user-agent': 'fastify-agent',
        },
        requestId: 'req-fastify',
        user: { id: 'profile-1', role: 'Admin', tenantId: 'tenant-1' },
        tenantContext: {
          tenantId: 'tenant-2',
          branchId: 'branch-2',
          contextKind: 'dev-support',
        },
      }),
    ).toMatchObject({
      actorProfileId: 'profile-1',
      actorRole: 'Admin',
      tenantId: 'tenant-2',
      branchId: 'branch-2',
      requestId: 'req-fastify',
      ip: '203.0.113.10',
      userAgent: 'fastify-agent',
    });
  });

  it('keeps Dev Support access audit context hashable and scoped', async () => {
    process.env.AUDIT_HASH_SECRET = 'c'.repeat(32);
    const prisma = {
      securityAuditEvent: {
        create: jest.fn().mockResolvedValue({ id: 'audit-dev-support' }),
      },
    };
    const service = new AuditService(prisma as any);

    await service.record({
      ...service.fromRequest({
        headers: {
          'x-forwarded-for': '198.51.100.42',
          'user-agent': 'dev-support-agent',
        },
        requestId: 'dev-request-1',
        user: { id: 'dev-profile', role: 'superAdmin' },
        tenantContext: {
          tenantId: 'tenant-real',
          branchId: 'branch-real',
          contextKind: 'dev-support',
        },
      }),
      eventType: 'dev_support.tenant_access',
      action: 'access_real_tenant',
      outcome: AuditOutcome.SUCCESS,
    });

    expect(prisma.securityAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'dev_support.tenant_access',
        actorProfileId: 'dev-profile',
        actorRole: 'superAdmin',
        tenantId: 'tenant-real',
        branchId: 'branch-real',
        contextKind: AuditContextKind.DEV_SUPPORT,
        requestId: 'dev-request-1',
        ipHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        userAgentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
  });
});
