import { MercadoPagoGatewayAdapter } from './gateways/mercado-pago/mercado-pago.adapter';

describe('MercadoPagoGatewayAdapter', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'test-token';
    process.env.MERCADO_PAGO_MODE = 'test';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('cria assinatura pendente hospedada sem plano associado', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'preapproval-1',
        init_point: 'https://mercadopago.test/authorize',
      }),
    }) as any;
    const adapter = new MercadoPagoGatewayAdapter({
      validate: jest.fn(),
    } as any);
    const result = await adapter.createCheckout({
      idempotencyKey: 'checkout-key-123',
      externalReference: 'ns_cs_reference',
      amountCents: 20000,
      currency: 'BRL',
      title: 'Ouro',
      recurrence: { frequency: 1, frequencyType: 'months' },
      payerEmail: 'admin@example.com',
      backUrl: 'https://app.example.com/api/billing/checkout/return',
    });
    expect(result).toMatchObject({
      gatewaySubscriptionId: 'preapproval-1',
      supportsExternalReference: true,
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.mercadopago.com/preapproval',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('ns_cs_reference'),
      }),
    );
    const request = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(JSON.parse(request.body)).toEqual({
      reason: 'Ouro',
      payer_email: 'admin@example.com',
      external_reference: 'ns_cs_reference',
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: 200,
        currency_id: 'BRL',
      },
      back_url: 'https://app.example.com/api/billing/checkout/return',
      status: 'pending',
    });
    expect(JSON.parse(request.body)).not.toHaveProperty('preapproval_plan_id');
  });

  it('normaliza pagamento consultado sem vazar regra ao dominio', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 10,
        status: 'approved',
        external_reference: 'reference',
        transaction_amount: 200,
        currency_id: 'BRL',
        date_approved: '2026-07-18T12:00:00Z',
        live_mode: false,
      }),
    }) as any;
    const result = await new MercadoPagoGatewayAdapter({
      validate: jest.fn(),
    } as any).getPaymentStatus('10');
    expect(result.normalizedStatus).toBe('APPROVED');
    expect(result.amountCents).toBe(20000);
  });

  it('retains only structured provider codes for rejected checkouts', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: { get: () => 'provider-request-1' },
      json: async () => ({
        cause: [
          {
            code: 'invalid_payer',
            description: 'payer email customer@example.com rejected 12345678',
          },
        ],
      }),
    }) as any;
    const adapter = new MercadoPagoGatewayAdapter({
      validate: jest.fn(),
    } as any);

    await expect(
      adapter.createCheckout({
        idempotencyKey: 'checkout-key-123',
        externalReference: 'ns_cs_reference',
        amountCents: 100,
        currency: 'BRL',
        title: 'Validação',
        recurrence: { frequency: 1, frequencyType: 'months' },
        payerEmail: 'admin@example.com',
        backUrl: 'https://app.example.com/api/billing/checkout/return',
      }),
    ).rejects.toMatchObject({
      failureCode: 'invalid_payer',
      providerStatus: 400,
      providerRequestId: 'provider-request-1',
    });
  });

  it('does not turn an arbitrary provider description into a failure code', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: { get: () => null },
      json: async () => ({
        cause: [{ description: 'payer email customer@example.com rejected' }],
      }),
    }) as any;

    await expect(
      new MercadoPagoGatewayAdapter({
        validate: jest.fn(),
      } as any).createCheckout({
        idempotencyKey: 'checkout-key-123',
        externalReference: 'ns_cs_reference',
        amountCents: 100,
        currency: 'BRL',
        title: 'Validação',
        recurrence: { frequency: 1, frequencyType: 'months' },
        payerEmail: 'admin@example.com',
        backUrl: 'https://app.example.com/api/billing/checkout/return',
      }),
    ).rejects.toMatchObject({ failureCode: 'GATEWAY_PROVIDER_REJECTED' });
  });
});
