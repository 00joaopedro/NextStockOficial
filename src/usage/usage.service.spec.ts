import { UsageService, usageProvider } from './usage.service';

describe('UsageService', () => {
  it('identifica a origem somente por variáveis de instância do provedor', () => {
    expect(usageProvider({ RENDER_INSTANCE_ID: 'instance' })).toBe('render');
    expect(usageProvider({ RAILWAY_REPLICA_ID: 'instance' })).toBe('railway');
    expect(usageProvider({ RENDER_SERVICE_ID: 'configured-api-id' })).toBeNull();
    expect(usageProvider({})).toBeNull();
    expect(usageProvider({ RENDER_INSTANCE_ID: 'r', RAILWAY_REPLICA_ID: 'w' })).toBeNull();
  });
  const prisma = {
    usageCaptureGap: { create: jest.fn() },
    userUsageEvent: {
      create: jest.fn(),
    },
  } as any;

  let service: UsageService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new UsageService(prisma);
  });

  it('record cria evento com peso padrao por tipo', async () => {
    prisma.userUsageEvent.create.mockResolvedValue({ id: 'event-id' });

    await service.record({
      userId: '0fefdbb8-0954-4ea0-991e-9be6a2f9c481',
      email: 'user@test.com',
      name: 'User',
      eventType: 'product_create',
      dbWriteCount: 1,
    });

    expect(prisma.userUsageEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: '0fefdbb8-0954-4ea0-991e-9be6a2f9c481',
        eventType: 'product_create',
        weight: 5,
        dbWriteCount: 1,
      }),
    });
  });

  it('registra lacuna após falha quando o banco volta', async () => {
    prisma.userUsageEvent.create.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ id: 'ok' });
    prisma.usageCaptureGap.create.mockResolvedValue({ id: 'gap' });
    await service.record({ userId: 'u', eventType: 'login' });
    await service.record({ userId: 'u', eventType: 'login' });
    expect(prisma.usageCaptureGap.create).toHaveBeenCalledWith({ data: expect.objectContaining({ startedAt: expect.any(Date), endedAt: expect.any(Date) }) });
  });

  it('record nao quebra fluxo se tabela estiver indisponivel', async () => {
    prisma.userUsageEvent.create.mockRejectedValue({
      code: 'P2021',
      message: 'The table public.user_usage_events does not exist.',
    });

    await expect(
      service.record({
        userId: '0fefdbb8-0954-4ea0-991e-9be6a2f9c481',
        eventType: 'login',
      }),
    ).resolves.toBeNull();
  });
});
