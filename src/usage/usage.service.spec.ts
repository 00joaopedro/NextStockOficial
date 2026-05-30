import { UsageService } from './usage.service';

describe('UsageService', () => {
  const prisma = {
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
