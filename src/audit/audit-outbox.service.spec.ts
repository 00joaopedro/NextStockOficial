import { AuditOutcome, AuditOutboxStatus } from '@prisma/client';
import { AuditOutboxService } from './audit-outbox.service';

describe('AuditOutboxService', () => {
  const input = {
    tenantId: '00000000-0000-4000-8000-000000000001',
    branchId: '00000000-0000-4000-8000-000000000002',
    operationId: 'storefront:create_guest_order:order-1',
    eventType: 'storefront.order_created',
    action: 'create_guest_order',
    outcome: AuditOutcome.SUCCESS,
    targetType: 'order',
    targetId: 'order-1',
    metadata: { password: 'do-not-store', itemCount: 2 },
  };

  it('enqueues through the supplied transaction client with stable sanitized identity', async () => {
    const execute = jest.fn().mockResolvedValue(1);
    const find = jest.fn();
    const service = new AuditOutboxService({} as any);
    const tx = {
      $executeRaw: execute,
      auditOutboxEvent: { findUniqueOrThrow: find },
    } as any;
    find.mockImplementation(({ where }) => ({
      ...where.tenantId_operationId,
      payloadHash: (service as any).data(input).payloadHash,
      metadata: { itemCount: 2 },
    }));
    const first = await service.enqueue(tx, input);
    const second = await service.enqueue(tx, input);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(first.payloadHash).toBe(second.payloadHash);
    expect(first.metadata).toEqual({ itemCount: 2 });
    expect(JSON.stringify(execute.mock.calls)).not.toContain('do-not-store');
  });

  it('propagates enqueue failures instead of confirming a mutation', async () => {
    const service = new AuditOutboxService({} as any);
    await expect(
      service.enqueue(
        {
          $executeRaw: jest.fn().mockRejectedValue(new Error('database down')),
        } as any,
        input,
      ),
    ).rejects.toThrow('database down');
  });

  it('does not claim new work after shutdown begins', async () => {
    const query = jest.fn();
    const service = new AuditOutboxService({ $queryRaw: query } as any);
    service.beforeApplicationShutdown();
    await expect(service.processBatch()).resolves.toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it('atomically inserts the authoritative event and fences finalization', async () => {
    const event = {
      id: '00000000-0000-4000-8000-000000000003',
      tenantId: input.tenantId,
      branchId: input.branchId,
      actorProfileId: null,
      actorRole: null,
      requestId: null,
      operationId: input.operationId,
      payloadHash: 'hash',
      eventType: input.eventType,
      action: input.action,
      outcome: input.outcome,
      severity: 'LOW',
      contextKind: 'NORMAL',
      targetType: input.targetType,
      targetId: input.targetId,
      reasonCode: null,
      ipHash: null,
      userAgentHash: null,
      metadata: { itemCount: 2 },
      beforeState: null,
      afterState: null,
      status: AuditOutboxStatus.PROCESSING,
    };
    const tx = {
      auditOutboxEvent: {
        findFirst: jest.fn().mockResolvedValue(event),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      securityAuditEvent: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn((fn) => fn(tx)),
      auditOutboxEvent: { findFirst: jest.fn(), updateMany: jest.fn() },
    };
    const service = new AuditOutboxService(prisma as any);
    await expect(
      service.deliver({ id: event.id, claimToken: 'claim' }),
    ).resolves.toBe(true);
    expect(tx.securityAuditEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { outboxEventId: event.id } }),
    );
    expect(tx.auditOutboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ claimToken: 'claim' }),
        data: expect.objectContaining({ status: AuditOutboxStatus.DELIVERED }),
      }),
    );
  });
});
