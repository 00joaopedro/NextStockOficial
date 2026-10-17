import { BillingEventType, SubscriptionStatus } from '@prisma/client';
import { SubscriptionsService, TRIAL_DAYS } from './subscriptions.service';

describe('SubscriptionsService', () => {
  it('cria trial de exatamente 15 dias e evento na mesma transaction', async () => {
    const startedAt = new Date('2026-06-28T10:00:00Z');
    const tx = {
      subscription: {
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'sub', ...data }),
          ),
      },
      billingEvent: { create: jest.fn().mockResolvedValue({ id: 'event' }) },
    } as any;
    const events = {
      create: jest
        .fn()
        .mockImplementation((data, transaction) =>
          transaction.billingEvent.create({ data }),
        ),
    } as any;
    const service = new SubscriptionsService({} as any, {} as any, events);

    await service.createTrial(tx, 'tenant', startedAt);

    const data = tx.subscription.create.mock.calls[0][0].data;
    expect(data.status).toBe(SubscriptionStatus.trialing);
    expect(data.trialEndsAt.getTime() - startedAt.getTime()).toBe(
      TRIAL_DAYS * 86_400_000,
    );
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: BillingEventType.TRIAL_STARTED }),
      tx,
    );
  });

  it('usa uma intenção durável e uma chave estável no cancelamento', async () => {
    const subscription = {
      id: 'sub',
      tenantId: 'tenant',
      status: SubscriptionStatus.active,
      gatewayProvider: 'MERCADO_PAGO',
      gatewaySubscriptionId: 'gateway-sub',
      version: 1,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      trialStartedAt: null,
      trialEndsAt: null,
      currentPeriodStartedAt: null,
      currentPeriodEndsAt: null,
      graceEndsAt: null,
      lastPaymentAt: null,
      plan: null,
    };
    const gateway = {
      cancelSubscription: jest.fn().mockResolvedValue(undefined),
    };
    const events = { create: jest.fn().mockResolvedValue(undefined) };
    const operation = {
      id: 'operation',
      claimToken: 'claim',
      state: 'CLAIMED',
    };
    const tx = {
      subscription: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValueOnce(subscription)
          .mockResolvedValueOnce({
            ...subscription,
            status: SubscriptionStatus.canceled,
          }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      billingSubscriptionOperation: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      subscription: { findFirst: jest.fn().mockResolvedValue(subscription) },
      billingSubscriptionOperation: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(operation),
        updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const gateways = {
      get: jest.fn().mockReturnValue(gateway),
    };
    const service = new SubscriptionsService(
      prisma as any,
      {} as any,
      events as any,
      gateways as any,
    );

    const result = await service.cancelForTenant('tenant');

    expect(gateway.cancelSubscription).toHaveBeenCalledWith(
      'gateway-sub',
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    expect(tx.billingSubscriptionOperation.updateMany).toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result?.status).toBe(SubscriptionStatus.canceled);
  });

  it('não chama o gateway novamente quando o cancelamento já foi concluído', async () => {
    const subscription = {
      id: 'sub',
      tenantId: 'tenant',
      status: SubscriptionStatus.canceled,
      gatewayProvider: 'MERCADO_PAGO',
      gatewaySubscriptionId: 'gateway-sub',
      version: 2,
      cancelAtPeriodEnd: false,
      canceledAt: new Date(),
      trialStartedAt: null,
      trialEndsAt: null,
      currentPeriodStartedAt: null,
      currentPeriodEndsAt: null,
      graceEndsAt: null,
      lastPaymentAt: null,
      plan: null,
    };
    const gateway = { cancelSubscription: jest.fn() };
    const prisma = {
      subscription: { findFirst: jest.fn().mockResolvedValue(subscription) },
      billingSubscriptionOperation: {
        findUnique: jest.fn().mockResolvedValue({
          state: 'SUCCEEDED',
        }),
      },
    };
    const service = new SubscriptionsService(
      prisma as any,
      {} as any,
      { create: jest.fn() } as any,
      { get: jest.fn().mockReturnValue(gateway) } as any,
    );

    await service.cancelForTenant('tenant');

    expect(gateway.cancelSubscription).not.toHaveBeenCalled();
  });

  it('preserva o acesso já pago até o fim do período ao cancelar no gateway', async () => {
    const subscription = {
      id: 'sub',
      tenantId: 'tenant',
      status: SubscriptionStatus.active,
      gatewayProvider: 'MERCADO_PAGO',
      gatewaySubscriptionId: 'gateway-sub',
      version: 1,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      trialStartedAt: null,
      trialEndsAt: null,
      currentPeriodStartedAt: new Date('2026-06-01T12:00:00Z'),
      currentPeriodEndsAt: new Date(Date.now() + 86_400_000),
      graceEndsAt: null,
      lastPaymentAt: new Date(),
      plan: null,
    };
    const updated = {
      ...subscription,
      status: SubscriptionStatus.canceled,
      cancelAtPeriodEnd: true,
    };
    const tx = {
      subscription: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValueOnce(subscription)
          .mockResolvedValueOnce(updated),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      billingSubscriptionOperation: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      subscription: { findFirst: jest.fn().mockResolvedValue(subscription) },
      billingSubscriptionOperation: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockResolvedValue({
            id: 'operation',
            claimToken: 'claim',
            state: 'CLAIMED',
          }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new SubscriptionsService(
      prisma as any,
      {} as any,
      { create: jest.fn().mockResolvedValue(undefined) } as any,
      {
        get: jest
          .fn()
          .mockReturnValue({
            cancelSubscription: jest.fn().mockResolvedValue(undefined),
          }),
      } as any,
    );

    const result = await service.cancelForTenant('tenant');

    expect(tx.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cancelAtPeriodEnd: true }),
      }),
    );
    expect(result?.cancelAtPeriodEnd).toBe(true);
  });

  it('não preserva período antigo ao cancelar assinatura já suspensa', async () => {
    const service = new SubscriptionsService({} as any, {} as any, {} as any);

    expect(
      (service as any).hasPaidAccessRemaining({
        status: SubscriptionStatus.suspended,
        currentPeriodEndsAt: new Date(Date.now() + 86_400_000),
      }),
    ).toBe(false);
  });
});
