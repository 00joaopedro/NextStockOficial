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

  it('localiza faturas recorrentes pelo id da assinatura sem solicitar estorno', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 'authorized-payment-1',
            preapproval_id: 'preapproval-1',
            status: 'processed',
            transaction_amount: 1,
            currency_id: 'BRL',
            payment: { id: 123, status: 'approved' },
          },
        ],
      }),
    }) as any;

    const result = await new MercadoPagoGatewayAdapter({
      validate: jest.fn(),
    } as any).findAuthorizedPayments('preapproval-1');

    expect(result).toEqual([
      expect.objectContaining({
        gatewayAuthorizedPaymentId: 'authorized-payment-1',
        gatewayPaymentId: '123',
        gatewaySubscriptionId: 'preapproval-1',
        amountCents: 100,
        currency: 'BRL',
      }),
    ]);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.mercadopago.com/authorized_payments/search?preapproval_id=preapproval-1&offset=0&limit=20',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      }),
    );
  });

  it('percorre todas as páginas de faturas recorrentes', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          paging: { offset: 0, limit: 20, total: 2 },
          results: [
            {
              id: 'authorized-payment-1',
              preapproval_id: 'preapproval-1',
              transaction_amount: 1,
              currency_id: 'BRL',
              payment: { id: 1 },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          paging: { offset: 1, limit: 20, total: 2 },
          results: [
            {
              id: 'authorized-payment-2',
              preapproval_id: 'preapproval-1',
              transaction_amount: 1,
              currency_id: 'BRL',
              payment: { id: 2 },
            },
          ],
        }),
      }) as any;

    const result = await new MercadoPagoGatewayAdapter({
      validate: jest.fn(),
    } as any).findAuthorizedPayments('preapproval-1');

    expect(result.map((invoice) => invoice.gatewayPaymentId)).toEqual(['1', '2']);
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'https://api.mercadopago.com/authorized_payments/search?preapproval_id=preapproval-1&offset=1&limit=20',
      expect.anything(),
    );
  });

  it('envia o término de uma promoção finita ao Mercado Pago', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'preapproval-promo',
        init_point: 'https://mercadopago.test/authorize',
      }),
    }) as any;
    const adapter = new MercadoPagoGatewayAdapter({
      validate: jest.fn(),
    } as any);

    await adapter.createCheckout({
      idempotencyKey: 'checkout-key-promo',
      externalReference: 'ns_cs_promo',
      amountCents: 6667,
      currency: 'BRL',
      title: 'Ouro — promoção 3 meses',
      recurrence: {
        frequency: 1,
        frequencyType: 'months',
        endDate: '2026-01-01T00:00:00.000Z',
      },
      payerEmail: 'admin@example.com',
      backUrl: 'https://app.example.com/api/billing/checkout/return',
    });

    const request = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(JSON.parse(request.body).auto_recurring).toMatchObject({
      frequency: 1,
      frequency_type: 'months',
      end_date: '2026-01-01T00:00:00.000Z',
      transaction_amount: 66.67,
      currency_id: 'BRL',
    });
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
