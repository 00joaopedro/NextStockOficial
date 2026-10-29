import { ServerUsageService } from './server-usage.service';

describe('ServerUsageService', () => {
  const originalRate = process.env.RAILWAY_USAGE_BRL_PER_USD;
  const prisma = { userUsageEvent: { groupBy: jest.fn() }, usageCaptureGap: { findFirst: jest.fn() } } as any;
  const railway = { getServiceUsage: jest.fn(), isUsageConfigured: jest.fn() } as any;

  beforeEach(() => {
    jest.resetAllMocks();
    railway.isUsageConfigured.mockReturnValue(true);
    prisma.usageCaptureGap.findFirst.mockResolvedValue(null);
    process.env.RAILWAY_USAGE_BRL_PER_USD = '5';
  });

  afterAll(() => {
    if (originalRate === undefined) delete process.env.RAILWAY_USAGE_BRL_PER_USD;
    else process.env.RAILWAY_USAGE_BRL_PER_USD = originalRate;
  });

  it('atribui o custo Railway proporcionalmente ao peso do tenant', async () => {
    railway.getServiceUsage.mockResolvedValue({
      available: true, costUsd: 10, periodStart: '2026-10-01T00:00:00.000Z',
      periodEnd: '2026-11-01T00:00:00.000Z', updatedAt: '2026-10-20T00:00:00.000Z', serviceIds: ['service'],
    });
    prisma.userUsageEvent.groupBy.mockResolvedValue([
      { tenantId: 'tenant-a', provider: 'railway', _sum: { weight: 1 } },
      { tenantId: 'tenant-b', provider: 'railway', _sum: { weight: 3 } },
    ]);
    const service = new ServerUsageService(prisma, railway);

    await expect(service.forTenant('tenant-a', 'ouro')).resolves.toMatchObject({
      available: true, percentage: 50, actualPercentage: 50, status: 'NORMAL',
    });
  });

  it('rateia cada provedor apenas pela atividade da sua origem', async () => {
    railway.getServiceUsage.mockResolvedValue({ available: true, costUsd: 10, periodStart: '2026-10-01T00:00:00Z', periodEnd: '2026-11-01T00:00:00Z' });
    const render = { hasUsageConfigurationIntent: jest.fn().mockReturnValue(true), getServiceUsage: jest.fn().mockResolvedValue({ available: true, costCents: 1000 }) };
    prisma.userUsageEvent.groupBy.mockResolvedValue([
      { tenantId: 'a', provider: 'railway', _sum: { weight: 1 } },
      { tenantId: 'b', provider: 'railway', _sum: { weight: 3 } },
      { tenantId: 'a', provider: 'render', _sum: { weight: 3 } },
      { tenantId: 'b', provider: 'render', _sum: { weight: 1 } },
    ]);
    await expect(new ServerUsageService(prisma, railway, render as any).forTenant('a', 'ouro')).resolves.toMatchObject({ available: true, percentage: 80 });
  });

  it('não estima com eventos de origem desconhecida ou lacuna de coleta', async () => {
    railway.getServiceUsage.mockResolvedValue({ available: true, costUsd: 10, periodStart: '2026-10-01T00:00:00Z', periodEnd: '2026-11-01T00:00:00Z' });
    prisma.userUsageEvent.groupBy.mockResolvedValue([{ tenantId: 'a', provider: null, _sum: { weight: 1 } }]);
    await expect(new ServerUsageService(prisma, railway).forTenant('a', 'ouro')).resolves.toMatchObject({ available: false, code: 'USAGE_ORIGIN_INCOMPLETE' });
    prisma.usageCaptureGap.findFirst.mockResolvedValue({ id: 'gap' });
    await expect(new ServerUsageService(prisma, railway).forTenant('a', 'ouro')).resolves.toMatchObject({ available: false, code: 'USAGE_COLLECTION_INCOMPLETE' });
  });

  it('nao reporta percentual quando a cotacao ou o provedor nao estao disponiveis', async () => {
    railway.getServiceUsage.mockResolvedValue({ available: false });
    const service = new ServerUsageService(prisma, railway);
    await expect(service.forTenant('tenant-a', 'diamante')).resolves.toMatchObject({
      available: false, code: 'PROVIDER_USAGE_UNAVAILABLE', percentage: null,
    });
  });

  it('nao aplica limite generico para plano desconhecido', async () => {
    const service = new ServerUsageService(prisma, railway);
    await expect(service.forTenant('tenant-a', 'novo-plano')).resolves.toMatchObject({
      available: false, code: 'PLAN_NOT_CONFIGURED',
    });
  });

  it('não estima somente Render quando Railway configurada falha', async () => {
    railway.getServiceUsage.mockResolvedValue({ available: false, periodStart: null, periodEnd: null });
    const render = {
      hasUsageConfigurationIntent: jest.fn().mockReturnValue(true),
      getServiceUsage: jest.fn().mockResolvedValue({ available: true, costCents: 500, updatedAt: '2026-10-20T00:00:00.000Z' }),
    };
    const service = new ServerUsageService(prisma, railway, render as any);
    await expect(service.forTenant('tenant-a', 'ouro')).resolves.toMatchObject({
      available: false,
      code: 'PROVIDER_USAGE_UNAVAILABLE',
    });
  });
});
