import { createHash } from 'node:crypto';
import { getPromotionOffer } from '../promotions/promotion-offers';
import { CheckoutService } from './checkout.service';

describe('promotional checkout recovery', () => {
  function fixture(slug = 'ouro') {
    const payloadHash = createHash('sha256')
      .update(
        JSON.stringify({
          operation: 'CREATE_CHECKOUT',
          planSlug: slug,
          promotionReservationId: 'reservation',
        }),
      )
      .digest('hex');
    const reservation = {
      id: 'reservation',
      checkoutSessionId: 'checkout' as string | null,
      expiresAt: new Date(0),
      metadata: { planSlug: slug, periodMonths: 3 },
    };
    const checkout = {
      id: 'checkout',
      planId: 'plan',
      provider: 'MERCADO_PAGO',
      status: 'OPEN',
      checkoutUrl: 'https://www.mercadopago.com/checkout',
    };
    const intent = {
      payloadHash,
      state: 'SUCCEEDED',
      checkoutSessionId: 'checkout',
    };
    const db = {
      promotionReservation: {
        findFirst: jest.fn().mockResolvedValue(reservation),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      plan: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'plan',
          interval: 'MONTHLY',
          intervalCount: 1,
          gatewayMappings: [{}],
        }),
      },
      subscription: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'sub', status: 'trialing' }),
      },
      userProfile: { findUnique: jest.fn().mockResolvedValue({ email: 'test@example.com' }) },
      billingCheckoutIntent: {
        create: jest.fn().mockResolvedValue({ id: 'intent', externalReference: 'reference' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(intent),
        findFirst: jest.fn().mockResolvedValue(intent),
      },
      checkoutSession: { findFirst: jest.fn().mockResolvedValue(checkout) },
      $transaction: jest.fn(),
    };
    const gateway = { createCheckout: jest.fn() };
    const service = new CheckoutService(
      db as any,
      {
        resolve: jest
          .fn()
          .mockResolvedValue({ tenantId: 'tenant', userId: 'user' }),
      } as any,
      { defaultProvider: () => 'MERCADO_PAGO', get: () => gateway } as any,
      {} as any,
    );
    return {
      db,
      reservation,
      intent,
      checkout,
      gateway,
      run: () =>
        service.create(
          {} as any,
          slug,
          'recovery-key-123',
          undefined,
          undefined,
          'reservation',
        ),
    };
  }
  it('recovers the same linked checkout without charging again, even after reservation expiry', async () => {
    const f = fixture();
    await expect(f.run()).resolves.toMatchObject({
      checkoutId: 'checkout',
      status: 'OPEN',
    });
    expect(f.db.promotionReservation.findFirst).toHaveBeenCalledWith({
      where: { id: 'reservation', tenantId: 'tenant', status: 'RESERVED' },
    });
    expect(f.gateway.createCheckout).not.toHaveBeenCalled();
    expect(f.db.$transaction).not.toHaveBeenCalled();
  });
  it.each(['payload', 'key', 'link', 'provider', 'pending', 'closed'])(
    'refuses unsafe recovery: %s',
    async (scenario) => {
      const f = fixture();
      if (scenario === 'payload') f.intent.payloadHash = 'different';
      if (scenario === 'key')
        f.db.billingCheckoutIntent.findUnique.mockResolvedValue(null as any);
      if (scenario === 'link') f.reservation.checkoutSessionId = 'other';
      if (scenario === 'provider') f.checkout.provider = 'OTHER';
      if (scenario === 'pending') f.intent.state = 'PROCESSING';
      if (scenario === 'closed')
        f.db.checkoutSession.findFirst.mockResolvedValue(null as any);
      await expect(f.run()).rejects.toThrow();
      expect(f.gateway.createCheckout).not.toHaveBeenCalled();
      expect(f.db.$transaction).not.toHaveBeenCalled();
    },
  );
  it.each([
    ['ouro', 1, 10_000],
    ['ouro', 3, 20_000],
    ['ouro', 6, 40_000],
    ['esmeralda', 1, 20_000],
    ['esmeralda', 3, 60_000],
    ['esmeralda', 6, 120_000],
  ])('sends the full %s charge every %i month(s)', async (slug, months, amount) => {
    const f = fixture(slug);
    const offer = getPromotionOffer(slug, months)!;
    f.reservation.checkoutSessionId = null;
    f.reservation.metadata = offer;
    f.db.checkoutSession.findFirst.mockResolvedValue(null);
    f.db.billingCheckoutIntent.findUnique.mockResolvedValue(null);
    const trialEndsAt = new Date('2099-01-15T12:00:00Z');
    f.db.subscription.findFirst.mockResolvedValue({ id: 'sub', status: 'trialing', trialEndsAt });
    const previous = process.env.PUBLIC_APP_URL;
    process.env.PUBLIC_APP_URL = 'https://nextstock.example';
    const stoppedAtGateway = new Error('mock gateway stopped');
    f.gateway.createCheckout.mockRejectedValueOnce(stoppedAtGateway);
    try {
      await expect(f.run()).rejects.toBe(stoppedAtGateway);
      expect(f.gateway.createCheckout).toHaveBeenCalledWith(expect.objectContaining({
        amountCents: amount,
        recurrence: {
          frequency: months,
          frequencyType: 'months',
          startDate: trialEndsAt.toISOString(),
          endDate: new Date(Date.UTC(2099, months, 15, 12)).toISOString(),
        },
      }));
    } finally {
      if (previous === undefined) delete process.env.PUBLIC_APP_URL;
      else process.env.PUBLIC_APP_URL = previous;
    }
  });

  it('starts checkout at the reserved price after the free trial and legacy expiration', async () => {
    const f = fixture();
    f.reservation.checkoutSessionId = null;
    f.reservation.metadata = {
      ...f.reservation.metadata, monthlyPriceCents: 6000, totalPriceCents: 18000,
    } as typeof f.reservation.metadata;
    f.db.checkoutSession.findFirst.mockResolvedValue(null);
    f.db.billingCheckoutIntent.findUnique.mockResolvedValue(null);
    f.db.subscription.findFirst.mockResolvedValue({
      id: 'sub', status: 'trialing', trialEndsAt: new Date(0),
    });
    const prev = process.env.PUBLIC_APP_URL;
    process.env.PUBLIC_APP_URL = 'https://nextstock.example';
    const stoppedAtGateway = new Error('mock gateway stopped');
    f.gateway.createCheckout.mockRejectedValueOnce(stoppedAtGateway);
    try {
      await expect(f.run()).rejects.toBe(stoppedAtGateway);
      expect(f.gateway.createCheckout).toHaveBeenCalledWith(expect.objectContaining({
        amountCents: 6000,
        recurrence: expect.objectContaining({ frequency: 1, frequencyType: 'months' }),
      }));
      expect(f.gateway.createCheckout.mock.calls[0][0].recurrence.startDate).toBeUndefined();
    } finally {
      if (prev === undefined) delete process.env.PUBLIC_APP_URL;
      else process.env.PUBLIC_APP_URL = prev;
    }
  });
});
