import { Role } from '@prisma/client';
import { BillingController } from './billing.controller';

describe('BillingController', () => {
  const originalEnabled = process.env.BILLING_PRODUCTION_TEST_ENABLED;
  const originalAdminEmail = process.env.BILLING_PRODUCTION_TEST_ADMIN_EMAIL;

  beforeEach(() => {
    process.env.BILLING_PRODUCTION_TEST_ENABLED = 'true';
    process.env.BILLING_PRODUCTION_TEST_ADMIN_EMAIL = 'admin@example.com';
  });

  afterAll(() => {
    if (originalEnabled === undefined) {
      delete process.env.BILLING_PRODUCTION_TEST_ENABLED;
    } else {
      process.env.BILLING_PRODUCTION_TEST_ENABLED = originalEnabled;
    }
    if (originalAdminEmail === undefined) {
      delete process.env.BILLING_PRODUCTION_TEST_ADMIN_EMAIL;
    } else {
      process.env.BILLING_PRODUCTION_TEST_ADMIN_EMAIL = originalAdminEmail;
    }
  });

  it('cancela a renovação antes de estornar o único pagamento técnico elegível', async () => {
    const subscriptions = { cancelForTenant: jest.fn().mockResolvedValue({}) };
    const payments = {
      productionTestRefundCapability: jest
        .fn()
        .mockResolvedValue({ enabled: true }),
      refundProductionTestForTenant: jest
        .fn()
        .mockResolvedValue({ accepted: true }),
    };
    const tenantContext = {
      resolve: jest.fn().mockResolvedValue({ tenantId: 'tenant' }),
    };
    const controller = new BillingController(
      {} as any,
      subscriptions as any,
      {} as any,
      {} as any,
      payments as any,
      tenantContext as any,
    );
    const request = {
      user: { email: 'admin@example.com', role: Role.Admin },
    } as any;

    await expect(
      controller.refundProductionTest(request),
    ).resolves.toMatchObject({
      ok: true,
      result: { accepted: true },
    });

    expect(subscriptions.cancelForTenant).toHaveBeenCalledWith('tenant');
    expect(payments.refundProductionTestForTenant).toHaveBeenCalledWith(
      'tenant',
    );
    expect(
      subscriptions.cancelForTenant.mock.invocationCallOrder[0],
    ).toBeLessThan(
      payments.refundProductionTestForTenant.mock.invocationCallOrder[0],
    );
  });

  it('expõe diagnóstico técnico somente leitura ao administrador autorizado', async () => {
    const payments = {
      productionTestRefundDiagnostic: jest.fn().mockResolvedValue({
        stage: 'PAYMENT_VALIDATION',
        code: 'PAYMENT_ELIGIBLE',
      }),
    };
    const tenantContext = {
      resolve: jest.fn().mockResolvedValue({ tenantId: 'tenant' }),
    };
    const controller = new BillingController(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      payments as any,
      tenantContext as any,
    );
    const request = {
      requestId: 'diagnostic-request',
      user: { email: 'admin@example.com', role: Role.Admin },
    } as any;

    await expect(
      controller.productionTestRefundDiagnostic(request),
    ).resolves.toEqual({
      ok: true,
      requestId: 'diagnostic-request',
      diagnostic: {
        stage: 'PAYMENT_VALIDATION',
        code: 'PAYMENT_ELIGIBLE',
      },
    });
    expect(payments.productionTestRefundDiagnostic).toHaveBeenCalledWith(
      'tenant',
    );
  });
});
