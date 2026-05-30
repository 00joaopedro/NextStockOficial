import { DevService } from './dev.service';

describe('DevService', () => {
  const prisma = {
    userProfile: {
      count: jest.fn(),
    },
    userUsageEvent: {
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

    await expect(service.getOverview('today')).resolves.toMatchObject({
      period: 'today',
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

    await expect(service.getOverview('today')).resolves.toMatchObject({
      period: 'today',
      usersSummary: {
        totalUsers: 2,
        activeUsers: 0,
        totalAccesses: 0,
      },
    });
  });

  it('retorna lista vazia quando user_usage_events ainda nao existe', async () => {
    prisma.userUsageEvent.groupBy.mockRejectedValue({
      code: 'P2021',
      message: 'The table public.user_usage_events does not exist in the current database.',
    });

    await expect(service.getUsersUsage('today')).resolves.toEqual({
      period: 'today',
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
});
