import { DevService } from './dev.service';

describe('DevService', () => {
  const prisma = {
    userProfile: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    userUsageEvent: {
      aggregate: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      groupBy: jest.fn(),
    },
  } as any;

  const railwayMetrics = {
    isConfigured: jest.fn(),
    getOverview: jest.fn(),
  } as any;

  const supabaseMetrics = {
    isConfigured: jest.fn(),
    isDatabaseConnected: jest.fn(),
    getOverview: jest.fn(),
  } as any;

  let service: DevService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new DevService(prisma, railwayMetrics, supabaseMetrics);
  });

  it('calcula periodos today, weekly e monthly', () => {
    const today = service.calculatePeriod('today');
    const weekly = service.calculatePeriod('weekly');
    const monthly = service.calculatePeriod('monthly');

    expect(today.start.getHours()).toBe(0);
    expect(today.start.getMinutes()).toBe(0);
    expect(weekly.end.getTime() - weekly.start.getTime()).toBeGreaterThanOrEqual(
      7 * 24 * 60 * 60 * 1000 - 1000,
    );
    expect(monthly.start.getDate()).toBe(1);
    expect(monthly.start.getHours()).toBe(0);
  });

  it('retorna estrutura mesmo quando Railway e Supabase falham', async () => {
    railwayMetrics.getOverview.mockRejectedValue(new Error('railway failed'));
    supabaseMetrics.getOverview.mockRejectedValue(new Error('supabase failed'));
    prisma.userProfile.count.mockResolvedValue(2);
    prisma.userUsageEvent.count.mockResolvedValue(3);
    prisma.userUsageEvent.groupBy.mockResolvedValue([{ userId: 'user-1' }]);
    prisma.userUsageEvent.aggregate.mockResolvedValue({ _sum: { weight: 3 } });

    await expect(service.getOverview('today')).resolves.toMatchObject({
      period: 'day',
      railway: { status: 'unavailable' },
      supabase: { status: 'unavailable' },
      usersSummary: {
        totalUsers: 2,
        activeUsers: 1,
        totalAccesses: 3,
      },
    });
  });

  it('retorna resumo vazio quando user_usage_events ainda nao existe', async () => {
    railwayMetrics.getOverview.mockResolvedValue({ status: 'ok' });
    supabaseMetrics.getOverview.mockResolvedValue({ status: 'ok' });
    prisma.userProfile.count.mockResolvedValue(2);
    prisma.userUsageEvent.count.mockRejectedValue({
      code: 'P2021',
      message: 'The table public.user_usage_events does not exist in the current database.',
    });
    prisma.userUsageEvent.aggregate.mockResolvedValue({ _sum: { weight: 0 } });

    await expect(service.getOverview('today')).resolves.toMatchObject({
      period: 'day',
      usersSummary: {
        totalUsers: 2,
        activeUsers: 0,
        totalAccesses: 0,
      },
    });
  });

  it('retorna lista vazia quando user_usage_events ainda nao existe', async () => {
    prisma.userProfile.findMany.mockResolvedValue([]);
    prisma.userProfile.count.mockResolvedValue(0);
    prisma.userUsageEvent.groupBy.mockRejectedValue({
      code: 'P2021',
      message: 'The table public.user_usage_events does not exist in the current database.',
    });

    await expect(service.getUsersUsage('today')).resolves.toMatchObject({
      period: 'day',
      users: [],
    });
  });

  it('ignora registro de uso quando user_usage_events ainda nao existe', async () => {
    prisma.userUsageEvent.create.mockRejectedValue({
      code: 'P2021',
      message: 'The table public.user_usage_events does not exist in the current database.',
    });

    await expect(
      service.recordUserUsage({
        userId: '0fefdbb8-0954-4ea0-991e-9be6a2f9c481',
        eventType: 'page_view',
      }),
    ).resolves.toBeNull();
  });

  it('lista todos os usuarios e zera uso quando nao ha eventos no periodo', async () => {
    prisma.userUsageEvent.groupBy.mockResolvedValue([]);
    prisma.userProfile.findMany.mockResolvedValue([
      {
        id: 'user-1',
        name: 'Ana',
        fullName: 'Ana',
        email: 'ana@test.com',
        systemType: 'padrao',
        memberships: [
          {
            tenant: { id: 'tenant-1', name: 'Empresa', systemType: 'padrao' },
            branch: { id: 'branch-1', name: 'Matriz' },
          },
        ],
      },
    ]);
    prisma.userProfile.count.mockResolvedValue(1);
    railwayMetrics.getOverview.mockResolvedValue({ status: 'ok', cpu: null });
    supabaseMetrics.getOverview.mockResolvedValue({ status: 'ok', databaseSize: null });

    await expect(service.getUsersUsage({ period: 'day' })).resolves.toMatchObject({
      period: 'day',
      isEstimated: true,
      users: [
        {
          id: 'user-1',
          accessCount: 0,
          eventWeight: 0,
          serverUsage: { units: 0 },
          databaseUsage: { units: 0 },
        },
      ],
    });
  });

  it('aceita aliases de periodo day/week/month e today/weekly/monthly', () => {
    expect(service.calculatePeriod('today').period).toBe('day');
    expect(service.calculatePeriod('day').period).toBe('day');
    expect(service.calculatePeriod('weekly').period).toBe('week');
    expect(service.calculatePeriod('week').period).toBe('week');
    expect(service.calculatePeriod('monthly').period).toBe('month');
    expect(service.calculatePeriod('month').period).toBe('month');
  });
});
