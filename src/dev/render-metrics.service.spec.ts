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

  it('não aceita taxa inválida como zero', () => {
    process.env.RENDER_USAGE_SERVICE_IDS = 'srv-hot';
    process.env.RENDER_USAGE_CENTS_PER_HOUR_BY_SERVICE = '{"srv-hot":null}';
    expect(new RenderMetricsService().isUsageConfigured()).toBe(false);
    process.env.RENDER_USAGE_CENTS_PER_HOUR_BY_SERVICE = '{"srv-hot":0}';
    expect(new RenderMetricsService().isUsageConfigured()).toBe(true);
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
        { values: [{ timestamp: '2026-10-01T01:00:00Z', value: 0 }] },
      ] });

    await expect(
      new RenderMetricsService().getServiceUsage(
        '2026-10-01T00:00:00Z',
        '2026-10-01T02:00:00Z',
      ),
    ).resolves.toMatchObject({ available: true, costCents: 30 });
  });

  it('não aceita uma janela parcial como se cobrisse todo o período', async () => {
    process.env.RENDER_USAGE_SERVICE_IDS = 'srv-hot';
    process.env.RENDER_USAGE_CENTS_PER_HOUR_BY_SERVICE = '{"srv-hot":10}';
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [
        { values: [{ timestamp: '2026-10-01T01:00:00Z', value: 1 }] },
      ],
    } as Response);
    await expect(
      new RenderMetricsService().getServiceUsage(
        '2026-10-01T00:00:00Z',
        '2026-10-01T03:00:00Z',
      ),
    ).resolves.toMatchObject({ available: false });
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
  it('usa amostras persistidas mesmo após falha da API e rejeita lacunas', async () => {
    process.env.RENDER_USAGE_SERVICE_IDS = 'srv-hot';
    process.env.RENDER_USAGE_CENTS_PER_HOUR_BY_SERVICE = '{"srv-hot":10}';
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-03T03:30:00Z'));
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    const findMany = jest.fn().mockResolvedValue([
      { serviceId: 'srv-hot', hourStart: new Date('2026-10-03T00:00:00Z'), instanceCount: 2 },
      { serviceId: 'srv-hot', hourStart: new Date('2026-10-03T01:00:00Z'), instanceCount: 1 },
    ]);
    const service = new RenderMetricsService({ providerUsageSample: { findMany } } as any);
    await expect(service.getServiceUsage('2026-10-03T00:00:00Z', '2026-10-03T02:00:00Z')).resolves.toMatchObject({ available: true, costCents: 30 });
    findMany.mockResolvedValueOnce([{ serviceId: 'srv-hot', hourStart: new Date('2026-10-03T00:00:00Z'), instanceCount: 2 }]);
    await expect(service.getServiceUsage('2026-10-03T00:00:00Z', '2026-10-03T02:00:00Z')).resolves.toMatchObject({ available: false, costCents: null });
  });

  it('persiste horas recuperáveis sem duplicar e exclui hora ainda aberta', async () => {
    process.env.RENDER_USAGE_SERVICE_IDS = 'srv-hot';
    process.env.RENDER_USAGE_CENTS_PER_HOUR_BY_SERVICE = '{"srv-hot":10}';
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-03T03:30:00Z'));
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => [
      { values: [{ timestamp: '2026-10-03T02:00:00Z', value: 1 }, { timestamp: '2026-10-03T03:00:00Z', value: 2 }] },
      { values: [{ timestamp: '2026-10-03T02:00:00Z', value: 1 }] },
    ] } as Response);
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    await new RenderMetricsService({ providerUsageSample: { createMany } } as any).collectRecent();
    expect(createMany).toHaveBeenCalledWith({ skipDuplicates: true, data: [{ provider: 'render', serviceId: 'srv-hot', hourStart: new Date('2026-10-03T02:00:00Z'), instanceCount: 1 }] });
  });

});
