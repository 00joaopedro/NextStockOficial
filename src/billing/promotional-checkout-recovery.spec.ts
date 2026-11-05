import { createHash } from 'node:crypto';
import { CheckoutService } from './checkout.service';

describe('promotional checkout recovery', () => {
  function fixture() {
    const payloadHash = createHash('sha256')
      .update(
        JSON.stringify({
          operation: 'CREATE_CHECKOUT',
          planSlug: 'ouro',
          promotionReservationId: 'reservation',
        }),
      )
      .digest('hex');
    const reservation = {
      id: 'reservation',
      checkoutSessionId: 'checkout' as string | null,
      expiresAt: new Date(0),
      metadata: { planSlug: 'ouro', periodMonths: 3 },
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
      billingCheckoutIntent: {
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
          'ouro',
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
  it('does not use expiry bypass for an unlinked reservation', async () => {
    const f = fixture();
    f.reservation.checkoutSessionId = null;
    await expect(f.run()).rejects.toThrow('expirou');
  });
});
