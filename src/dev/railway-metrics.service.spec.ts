import { RailwayMetricsService } from './railway-metrics.service';

describe('RailwayMetricsService', () => {
  const originalEnvironment = {
    RAILWAY_API_TOKEN: process.env.RAILWAY_API_TOKEN,
    RAILWAY_PROJECT_ID: process.env.RAILWAY_PROJECT_ID,
    RAILWAY_WORKSPACE_ID: process.env.RAILWAY_WORKSPACE_ID,
    RAILWAY_USAGE_SERVICE_IDS: process.env.RAILWAY_USAGE_SERVICE_IDS,
    RAILWAY_ENVIRONMENT_ID: process.env.RAILWAY_ENVIRONMENT_ID,
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env.RAILWAY_API_TOKEN = 'test-token';
    process.env.RAILWAY_PROJECT_ID = 'project-a';
    process.env.RAILWAY_WORKSPACE_ID = 'workspace-a';
    process.env.RAILWAY_USAGE_SERVICE_IDS = 'service-a';
    delete process.env.RAILWAY_ENVIRONMENT_ID;
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('does not require a deployment environment to query workspace usage', () => {
    expect(new RailwayMetricsService().isUsageConfigured()).toBe(true);
  });

  it('returns unavailable when the configured service has no usable measurements', async () => {
    const service = new RailwayMetricsService() as any;
    jest.spyOn(service, 'graphql')
      .mockResolvedValueOnce({ workspace: { customer: { billingPeriod: {
        start: '2026-10-01T00:00:00.000Z', end: '2026-11-01T00:00:00.000Z',
      } } } })
      .mockResolvedValueOnce({ usage: [{
        measurement: 'CPU_USAGE', value: 1,
        tags: { projectId: 'project-a', serviceId: 'replaced-service' },
      }] });

    await expect(service.getServiceUsage()).resolves.toMatchObject({
      available: false, costUsd: null,
    });
  });

  it('keeps an actual zero measurement available', async () => {
    const service = new RailwayMetricsService() as any;
    jest.spyOn(service, 'graphql')
      .mockResolvedValueOnce({ workspace: { customer: { billingPeriod: {
        start: '2026-10-01T00:00:00.000Z', end: '2026-11-01T00:00:00.000Z',
      } } } })
      .mockResolvedValueOnce({ usage: [{
        measurement: 'CPU_USAGE', value: 0,
        tags: { projectId: 'project-a', serviceId: 'service-a' },
      }] });

    await expect(service.getServiceUsage()).resolves.toMatchObject({
      available: true, costUsd: 0,
    });
  });
});
