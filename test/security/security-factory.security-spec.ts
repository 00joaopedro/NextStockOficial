import { createCheckout } from '../factories/security.factory';

describe('security factories', () => {
  it('creates a checkout with every required synthetic field', async () => {
    const create = jest.fn().mockImplementation(({ data }) => data);
    const prisma = {
      checkoutSession: { create },
    };

    const checkout = await createCheckout(prisma as never, {
      tenant: { id: '00000000-0000-4000-8000-000000000001' },
      plan: {
        id: '00000000-0000-4000-8000-000000000002',
        priceCents: 1990,
        currency: 'BRL',
      },
      profile: { id: '00000000-0000-4000-8000-000000000003' },
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(checkout).toMatchObject({
      tenantId: '00000000-0000-4000-8000-000000000001',
      planId: '00000000-0000-4000-8000-000000000002',
      createdById: '00000000-0000-4000-8000-000000000003',
      provider: 'MERCADO_PAGO',
      expectedAmountCents: 1990,
      currency: 'BRL',
    });
    expect(checkout.checkoutUrl).toBe(
      `https://checkout.test.invalid/session/${checkout.externalReference}`,
    );
  });
});
