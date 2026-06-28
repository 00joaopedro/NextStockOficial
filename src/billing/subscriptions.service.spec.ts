import { BillingEventType, SubscriptionStatus } from '@prisma/client';
import { SubscriptionsService, TRIAL_DAYS } from './subscriptions.service';

describe('SubscriptionsService', () => {
  it('cria trial de exatamente 15 dias e evento na mesma transaction', async () => {
    const startedAt = new Date('2026-06-28T10:00:00Z');
    const tx = {
      subscription: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'sub', ...data }),
        ),
      },
      billingEvent: { create: jest.fn().mockResolvedValue({ id: 'event' }) },
    } as any;
    const events = {
      create: jest.fn().mockImplementation((data, transaction) =>
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
});
