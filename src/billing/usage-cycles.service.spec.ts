import { UsageCyclesService } from './usage-cycles.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RailwayMetricsService } from '../dev/railway-metrics.service';
import type { RenderMetricsService } from '../dev/render-metrics.service';

describe('billing cycle usage estimates', () => {
  const start = new Date('2026-09-10T12:00:00Z');
  const end = new Date('2026-10-10T12:00:00Z');
  const invoice = {
    id: 'invoice',
    tenantId: 'a',
    status: 'PAID',
    periodStartedAt: start,
    periodEndsAt: end,
  };
  const originalFx = process.env.RAILWAY_USAGE_BRL_PER_USD;
  let prisma: {
    subscription: { findFirst: jest.Mock };
    billingInvoice: { findFirst: jest.Mock; findMany: jest.Mock };
    billingUsageCycle: {
      findFirst: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    usageMeteringState: { findUnique: jest.Mock };
    usageCaptureGap: { findFirst: jest.Mock };
    userUsageEvent: { groupBy: jest.Mock };
  };
  let railway: { isUsageConfigured: () => boolean; getServiceUsage: jest.Mock };
  let render: {
    isUsageConfigured: () => boolean;
    getRecordedCycleCost: jest.Mock;
  };
  let service: UsageCyclesService;
  beforeEach(() => {
    process.env.RAILWAY_USAGE_BRL_PER_USD = '6';
    prisma = {
      subscription: { findFirst: jest.fn().mockResolvedValue({ id: 'sub' }) },
      billingInvoice: {
        findFirst: jest.fn().mockResolvedValue(invoice),
        findMany: jest.fn().mockResolvedValue([invoice]),
      },
      billingUsageCycle: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: unknown }) =>
            Promise.resolve(data),
          ),
        updateMany: jest.fn(),
      },
      usageMeteringState: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ startedAt: new Date('2026-09-01T00:00:00Z') }),
      },
      usageCaptureGap: { findFirst: jest.fn().mockResolvedValue(null) },
      userUsageEvent: {
        groupBy: jest.fn().mockResolvedValue([
          { tenantId: 'a', provider: 'railway', _sum: { weight: 1 } },
          { tenantId: 'b', provider: 'railway', _sum: { weight: 3 } },
          { tenantId: 'a', provider: 'render', _sum: { weight: 3 } },
          { tenantId: 'b', provider: 'render', _sum: { weight: 1 } },
        ]),
      },
    };
    railway = {
      isUsageConfigured: () => true,
      getServiceUsage: jest.fn().mockResolvedValue({
        available: true,
        costUsd: 10,
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
      }),
    };
    render = {
      isUsageConfigured: () => true,
      getRecordedCycleCost: jest.fn().mockResolvedValue(1000),
    };
    service = new UsageCyclesService(
      prisma as unknown as PrismaService,
      railway as unknown as RailwayMetricsService,
      render as unknown as RenderMetricsService,
    );
  });
  afterAll(() => {
    if (originalFx === undefined) delete process.env.RAILWAY_USAGE_BRL_PER_USD;
    else process.env.RAILWAY_USAGE_BRL_PER_USD = originalFx;
  });

  it('allocates each provider only over the paid invoice interval and stores BRL evidence', async () => {
    await expect(service.assess(invoice)).resolves.toMatchObject({
      status: 'ESTIMATED',
      costCents: 2250,
      tenantId: 'a',
      invoiceId: 'invoice',
      evidence: { eligibleForDowngrade: false, brlPerUsd: 6 },
    });
    expect(railway.getServiceUsage).toHaveBeenCalledWith({ start, end });
    expect(render.getRecordedCycleCost).toHaveBeenCalledWith(start, end);
    expect(prisma.userUsageEvent.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { createdAt: { gte: start, lt: end } },
      }),
    );
  });
  it('does not invent historical coverage before collection began', async () => {
    prisma.usageMeteringState.findUnique.mockResolvedValue({
      startedAt: new Date('2026-09-11T00:00:00Z'),
    });
    await expect(service.assess(invoice)).resolves.toMatchObject({
      status: 'UNAVAILABLE',
      costCents: null,
      reason: 'COLLECTION_STARTED_AFTER_CYCLE',
    });
    expect(railway.getServiceUsage).not.toHaveBeenCalled();
  });
  it('rejects capture gaps, unidentified origin and missing provider samples', async () => {
    prisma.usageCaptureGap.findFirst.mockResolvedValue({ id: 'gap' });
    await expect(service.assess(invoice)).resolves.toMatchObject({
      reason: 'USAGE_COLLECTION_INCOMPLETE',
    });
    prisma.usageCaptureGap.findFirst.mockResolvedValue(null);
    prisma.userUsageEvent.groupBy.mockResolvedValue([
      { tenantId: 'a', provider: null, _sum: { weight: 1 } },
    ]);
    await expect(service.assess(invoice)).resolves.toMatchObject({
      reason: 'USAGE_ORIGIN_INCOMPLETE',
    });
    render.getRecordedCycleCost.mockResolvedValue(null);
    await expect(service.assess(invoice)).resolves.toMatchObject({
      reason: 'PROVIDER_COVERAGE_INCOMPLETE',
    });
  });
  it('does not charge zero for a provider with positive cost but no activity', async () => {
    prisma.userUsageEvent.groupBy.mockResolvedValue([]);
    await expect(service.assess(invoice)).resolves.toMatchObject({
      reason: 'PROVIDER_ACTIVITY_UNAVAILABLE',
      costCents: null,
    });
  });
  it('does not overwrite a previously stored estimate with changed rates', async () => {
    prisma.billingUsageCycle.findFirst.mockResolvedValue({
      status: 'ESTIMATED',
      costCents: 123,
    });
    await expect(service.assess(invoice)).resolves.toMatchObject({
      costCents: 123,
    });
    expect(railway.getServiceUsage).not.toHaveBeenCalled();
    expect(prisma.billingUsageCycle.create).not.toHaveBeenCalled();
  });
  it('does not collect an unpaid, open or invalid interval', async () => {
    await service.assess({ ...invoice, status: 'REFUNDED' });
    await service.assess({
      ...invoice,
      periodEndsAt: new Date(Date.now() + 1000),
    });
    await service.assess({ ...invoice, periodEndsAt: start });
    expect(prisma.billingUsageCycle.create).not.toHaveBeenCalled();
  });
  it('scopes the latest cycle to the authenticated tenant and current subscription', async () => {
    await service.lastCompletedForTenant('a');
    expect(prisma.billingInvoice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'a',
          subscriptionId: 'sub',
        }) as unknown,
        orderBy: { periodEndsAt: 'desc' },
      }),
    );
    expect(prisma.billingUsageCycle.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 'a', invoiceId: 'invoice' },
    });
  });
  it('never falls back to an older paid cycle or enables downgrade', async () => {
    prisma.billingInvoice.findFirst.mockResolvedValue({
      ...invoice,
      status: 'REFUNDED',
    });
    await expect(service.lastCompletedForTenant('a')).resolves.toMatchObject({
      status: 'UNAVAILABLE',
      reason: 'CYCLE_NOT_PAID',
      eligibleForDowngrade: false,
    });
    expect(prisma.billingInvoice.findFirst).toHaveBeenCalledTimes(1);
  });
});
