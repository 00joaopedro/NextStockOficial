import {
  BillingPaymentStatus,
  BillingRefundIntentState,
  PaymentGatewayProvider,
  Prisma,
} from '@prisma/client';
import { PaymentsService } from './payments.service';
import { GatewayCheckoutError } from './gateways/payment-gateway.interface';

describe('durable refund idempotency', () => {
  it('trata erros temporários do provedor como resultado incerto', () => {
    const service = new PaymentsService({} as any, {} as any, {} as any);
    const error = new GatewayCheckoutError('temporário', true, {
      code: 'GATEWAY_UNAVAILABLE',
      providerStatus: 503,
      state: 'FAILED_RETRYABLE',
    });
    expect((service as any).refundFailureState(error)).toBe(
      BillingRefundIntentState.UNKNOWN,
    );
  });
  it('allows only one gateway refund while a concurrent request is in flight', async () => {
    const payment = {
      id: 'payment',
      tenantId: 'tenant',
      provider: PaymentGatewayProvider.MERCADO_PAGO,
      gatewayPaymentId: 'gateway-payment',
      status: BillingPaymentStatus.APPROVED,
    };
    const intent = {
      id: 'refund-intent',
      claimToken: 'claim-token',
      state: BillingRefundIntentState.CLAIMED,
    };
    let currentState: BillingRefundIntentState | null = null;
    let releaseGateway!: () => void;
    let gatewayStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      gatewayStarted = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseGateway = resolve;
    });
    const gateway = {
      refundPayment: jest.fn(async () => {
        gatewayStarted();
        await release;
        return { refundId: '123', status: 'approved' };
      }),
      getPaymentStatus: jest.fn().mockResolvedValue({
        gatewayPaymentId: 'gateway-payment',
        status: 'refunded',
        normalizedStatus: 'REFUNDED',
        externalReference:
          'ns_cs_00000000-0000-0000-0000-000000000000_aaaaaaaaaaaaaaaa',
        amountCents: 1000,
        currency: 'BRL',
        paidAt: null,
        providerOccurredAt: new Date(),
        gatewaySubscriptionId: null,
        raw: {},
      }),
    };
    const prisma = {
      billingPayment: {
        findFirst: jest.fn().mockResolvedValue(payment),
      },
      billingRefundIntent: {
        findUnique: jest
          .fn()
          .mockImplementation(async () =>
            currentState ? { ...intent, state: currentState } : null,
          ),
        create: jest.fn().mockImplementation(async () => {
          if (currentState) {
            throw new Prisma.PrismaClientKnownRequestError('unique', {
              code: 'P2002',
              clientVersion: 'test',
            });
          }
          currentState = BillingRefundIntentState.CLAIMED;
          return intent;
        }),
        findUniqueOrThrow: jest.fn().mockImplementation(async () => ({
          ...intent,
          state: currentState,
        })),
        updateMany: jest.fn().mockImplementation(async ({ data }: any) => {
          currentState = data.state;
          return { count: 1 };
        }),
      },
    } as any;
    const service = new PaymentsService(
      prisma,
      {} as any,
      { get: () => gateway } as any,
    );
    jest
      .spyOn(service, 'processVerifiedPayment')
      .mockResolvedValue({ processed: true } as any);

    const first = service.refundForTenant('tenant', 'payment');
    await started;
    const second = service.refundForTenant('tenant', 'payment');
    await expect(second).rejects.toThrow(
      'não será feita uma segunda chamada ao gateway',
    );
    releaseGateway();
    await expect(first).resolves.toMatchObject({
      accepted: true,
      status: BillingRefundIntentState.SUCCEEDED,
    });
    expect(gateway.refundPayment).toHaveBeenCalledTimes(1);
    expect(gateway.refundPayment).toHaveBeenCalledWith(
      'gateway-payment',
      'refund-intent',
    );
    expect(prisma.billingRefundIntent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { gatewayRefundId: '123', gatewayRefundStatus: 'approved' },
      }),
    );
  });
});
