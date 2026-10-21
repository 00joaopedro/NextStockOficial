import { BadRequestException } from '@nestjs/common';
import { AdminOperationService } from './admin-operation.service';

describe('AdminOperationService', () => {
  const input = {
    tenantScope: 'tenant-1',
    operation: 'PAYMENT_CONNECTION_REVOKE',
    targetId: 'connection-1',
    idempotencyKey: 'admin-operation-key-1',
  };

  it('replays a completed operation without invoking its effect again', async () => {
    const existing = { ...input, result: { revoked: true, applied: true } };
    const prisma = {
      $transaction: jest.fn(async (callback) => callback({
        administrativeOperationExecution: {
          findUnique: jest.fn().mockResolvedValue(existing),
        },
      })),
      administrativeOperationExecution: { findUnique: jest.fn() },
    } as any;
    const service = new AdminOperationService(prisma);
    const effect = jest.fn();

    await expect(service.execute(input, effect)).resolves.toEqual({
      result: existing.result,
      replayed: true,
    });
    expect(effect).not.toHaveBeenCalled();
  });

  it('rejects a missing or unsafe idempotency key before mutating', async () => {
    const service = new AdminOperationService({} as any);
    await expect(service.execute({ ...input, idempotencyKey: 'short' }, jest.fn()))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
