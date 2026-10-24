import { RenderMetricsService } from './render-metrics.service';

describe('RenderMetricsService', () => {
  const original = {
    key: process.env.RENDER_API_KEY,
    ids: process.env.RENDER_USAGE_SERVICE_IDS,
    rates: process.env.RENDER_USAGE_CENTS_PER_HOUR_BY_SERVICE,
  };

  beforeEach(() => {
    process.env.RENDER_API_KEY = 'render-test-key';
    process.env.RENDER_USAGE_SERVICE_IDS = 'srv-hot,srv-cold';
    process.env.RENDER_USAGE_CENTS_PER_HOUR_BY_SERVICE =
      '{"srv-hot":10,"srv-cold":20}';
    jest.restoreAllMocks();
  });

  afterAll(() => {
    if (original.key === undefined) delete process.env.RENDER_API_KEY;
    else process.env.RENDER_API_KEY = original.key;
    if (original.ids === undefined) delete process.env.RENDER_USAGE_SERVICE_IDS;
    else process.env.RENDER_USAGE_SERVICE_IDS = original.ids;
    if (original.rates === undefined) delete process.env.RENDER_USAGE_CENTS_PER_HOUR_BY_SERVICE;
    else process.env.RENDER_USAGE_CENTS_PER_HOUR_BY_SERVICE = original.rates;
  });

  it('não cobra reserva fria e soma réplicas quentes sem duplicar séries', async () => {
    const fetchMock = jest.spyOn(global, 'fetch') as jest.Mock;
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [
        { values: [{ timestamp: '2026-10-01T00:00:00Z', value: 2 }] },
        { values: [{ timestamp: '2026-10-01T00:00:00Z', value: 2 }] },
        { values: [{ timestamp: '2026-10-01T01:00:00Z', value: 1 }] },
      ] })
      .mockResolvedValueOnce({ ok: true, json: async () => [
        { values: [{ timestamp: '2026-10-01T00:00:00Z', value: 0 }] },
      ] });

    await expect(
      new RenderMetricsService().getServiceUsage(
        '2026-10-01T00:00:00Z',
        '2026-10-01T02:00:00Z',
      ),
    ).resolves.toMatchObject({ available: true, costCents: 30 });
  });

  it('falha fechada quando uma reserva configurada não fornece métrica', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);
    await expect(
      new RenderMetricsService().getServiceUsage(
        '2026-10-01T00:00:00Z',
        '2026-10-01T02:00:00Z',
      ),
    ).resolves.toMatchObject({ available: false, costCents: null });
  });
});
