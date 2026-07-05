import { AuditOutcome } from '@prisma/client';
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
});
