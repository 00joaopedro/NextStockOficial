import { ReconciliationSchedulerService } from './reconciliation-scheduler.service';

describe('automatic billing reconciliation', () => {
  it('runs only when the shared lease is acquired and releases it', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ token: 'lease' }]), $executeRaw: jest.fn().mockResolvedValue(1) };
    const reconciliation = { reconcilePendingBatch: jest.fn().mockResolvedValue({ failed: 0 }) };
    const service = new ReconciliationSchedulerService(prisma as any, reconciliation as any);
    await service.runOnce();
    expect(reconciliation.reconcilePendingBatch).toHaveBeenCalledWith(20);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });
  it('does not run when another instance owns the lease', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([]), $executeRaw: jest.fn() };
    const reconciliation = { reconcilePendingBatch: jest.fn() };
    await new ReconciliationSchedulerService(prisma as any, reconciliation as any).runOnce();
    expect(reconciliation.reconcilePendingBatch).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
  it('releases a lease after a failure so the next attempt can run', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ token: 'lease' }]), $executeRaw: jest.fn().mockResolvedValue(1) };
    const reconciliation = { reconcilePendingBatch: jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ failed: 0 }) };
    const service = new ReconciliationSchedulerService(prisma as any, reconciliation as any);
    await service.runOnce();
    await service.runOnce();
    expect(reconciliation.reconcilePendingBatch).toHaveBeenCalledTimes(2);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
  });
  it('avoids overlapping runs within the same process', async () => {
    let done!: () => void;
    const pending = new Promise<void>((resolve) => { done = resolve; });
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ token: 'lease' }]), $executeRaw: jest.fn().mockResolvedValue(1) };
    const reconciliation = { reconcilePendingBatch: jest.fn(async () => { await pending; return { failed: 0 }; }) };
    const service = new ReconciliationSchedulerService(prisma as any, reconciliation as any);
    const first = service.runOnce();
    await service.runOnce();
    done();
    await first;
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
