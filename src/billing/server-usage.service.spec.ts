import { ServerUsageService } from './server-usage.service';

describe('ServerUsageService', () => {
  const originalRate = process.env.RAILWAY_USAGE_BRL_PER_USD;
  const prisma = { userUsageEvent: { groupBy: jest.fn() } } as any;
  const railway = { getServiceUsage: jest.fn() } as any;

  beforeEach(() => {
    jest.resetAllMocks();
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
      { tenantId: 'tenant-a', _sum: { weight: 1 } },
      { tenantId: 'tenant-b', _sum: { weight: 3 } },
    ]);
    const service = new ServerUsageService(prisma, railway);

    await expect(service.forTenant('tenant-a', 'ouro')).resolves.toMatchObject({
      available: true, percentage: 50, actualPercentage: 50, status: 'NORMAL',
    });
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
});
