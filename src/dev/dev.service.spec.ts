import { DevService } from './dev.service';

describe('DevService', () => {
  const prisma = {
    userProfile: {
      count: jest.fn(),
    },
    userUsageEvent: {
      count: jest.fn(),
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
    jest.clearAllMocks();
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
});
