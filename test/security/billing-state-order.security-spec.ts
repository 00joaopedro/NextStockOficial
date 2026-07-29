import {
  CheckoutSessionStatus,
  PaymentGatewayProvider,
  PrismaClient,
  SubscriptionStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { BillingEventsService } from '../../src/billing/billing-events.service';
import { createBillingExternalReference } from '../../src/billing/external-reference.util';
import { PaymentsService } from '../../src/billing/payments.service';
import {
  assertSafeTestDatabaseUrl,
  hasSecurityTestDatabase,
} from '../helpers/test-database.guard';

const runDatabaseSuite =
  hasSecurityTestDatabase() || process.env.CI === 'true'
    ? describe
    : describe.skip;
const provider = PaymentGatewayProvider.MERCADO_PAGO;
const baseTime = new Date('2026-07-29T12:00:00.000Z');

type State = 'PENDING' | 'REJECTED' | 'APPROVED' | 'REFUNDED';

function barrier(size: number) {
  let count = 0;
  let release!: () => void;
  const open = new Promise<void>((resolve) => (release = resolve));
  return async <T>(work: () => Promise<T>) => {
    if (++count === size) release();
    await open;
    return work();
  };
}

runDatabaseSuite('RC-004 billing state ordering on PostgreSQL 16', () => {
  let prismaA: PrismaClient;
  let prismaB: PrismaClient;
  let serviceA: PaymentsService;
  let serviceB: PaymentsService;
  const tenants: string[] = [];
  const plans: string[] = [];
  const databaseUrl = hasSecurityTestDatabase()
    ? assertSafeTestDatabaseUrl(process.env.SECURITY_TEST_DATABASE_URL)
    : undefined;

  beforeAll(async () => {
    if (!databaseUrl)
      throw new Error('SECURITY_TEST_DATABASE_URL is required for RC-004.');
    const url = new URL(databaseUrl);
    url.searchParams.set('connection_limit', '60');
    url.searchParams.set('pool_timeout', '60');
    prismaA = new PrismaClient({ datasourceUrl: url.toString() });
    prismaB = new PrismaClient({ datasourceUrl: url.toString() });
    await Promise.all([prismaA.$connect(), prismaB.$connect()]);
    serviceA = new PaymentsService(
      prismaA as any,
      new BillingEventsService(prismaA as any),
    );
    serviceB = new PaymentsService(
      prismaB as any,
      new BillingEventsService(prismaB as any),
    );
  });

  afterAll(async () => {
    for (const tenantId of tenants) {
      await prismaA.billingEvent.deleteMany({ where: { tenantId } });
      await prismaA.billingPayment.deleteMany({ where: { tenantId } });
      await prismaA.billingInvoice.deleteMany({ where: { tenantId } });
      await prismaA.checkoutSession.deleteMany({ where: { tenantId } });
      await prismaA.subscription.deleteMany({ where: { tenantId } });
      await prismaA.branch.deleteMany({ where: { tenantId } });
      await prismaA.tenant.deleteMany({ where: { id: tenantId } });
    }
    await prismaA.plan.deleteMany({ where: { id: { in: plans } } });
    await Promise.all([prismaA?.$disconnect(), prismaB?.$disconnect()]);
  });

  async function fixture() {
    const plan = await prismaA.plan.create({
      data: {
        name: 'RC-004',
        slug: `rc004-${randomUUID()}`,
        priceCents: 20000,
      },
    });
    plans.push(plan.id);
    const tenant = await prismaA.tenant.create({
      data: { name: 'RC-004', slug: `rc004-${randomUUID()}` },
    });
    tenants.push(tenant.id);
    const branch = await prismaA.branch.create({
      data: {
        tenantId: tenant.id,
        name: 'RC-004',
        slug: `rc004-${randomUUID()}`,
        isDefault: true,
      },
    });
    const subscription = await prismaA.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        status: SubscriptionStatus.payment_pending,
      },
    });
    const externalReference = createBillingExternalReference();
    const checkout = await prismaA.checkoutSession.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        subscriptionId: subscription.id,
        provider,
        gatewayCheckoutId: `checkout-${randomUUID()}`,
        checkoutUrl: 'https://local.invalid/checkout',
        externalReference,
        expectedAmountCents: 20000,
        currency: 'BRL',
      },
    });
    return { plan, tenant, branch, subscription, checkout, externalReference };
  }

  function payment(
    f: Awaited<ReturnType<typeof fixture>>,
    state: State,
    at: Date | null = baseTime,
  ) {
    return {
      gatewayPaymentId: `payment-${f.checkout.id}`,
      status: state.toLowerCase(),
      normalizedStatus: state,
      externalReference: f.externalReference,
      amountCents: 20000,
      currency: 'BRL',
      paidAt: state === 'APPROVED' ? at : null,
      providerOccurredAt: at,
      gatewaySubscriptionId: null,
      raw: {
        status: state.toLowerCase(),
        date_last_updated: at?.toISOString(),
      },
    } as const;
  }

  async function assertAggregate(
    f: Awaited<ReturnType<typeof fixture>>,
    expected: State,
  ) {
    const [p, i, c, s] = await Promise.all([
      prismaA.billingPayment.findFirstOrThrow({
        where: { checkoutSessionId: f.checkout.id },
      }),
      prismaA.billingInvoice.findFirstOrThrow({
        where: { tenantId: f.tenant.id },
      }),
      prismaA.checkoutSession.findUniqueOrThrow({
        where: { id: f.checkout.id },
      }),
      prismaA.subscription.findUniqueOrThrow({
        where: { id: f.subscription.id },
      }),
    ]);
    expect(p.status).toBe(expected);
    expect(i.lastPaymentState).toBe(expected);
    expect(c.lastPaymentState).toBe(expected);
    expect(s.lastPaymentState).toBe(expected);
    if (expected === 'APPROVED') {
      expect(i.status).toBe('PAID');
      expect(c.status).toBe(CheckoutSessionStatus.COMPLETED);
      expect(s.status).toBe(SubscriptionStatus.active);
    }
    if (expected === 'REFUNDED') {
      expect(i.status).toBe('REFUNDED');
      expect(s.status).toBe(SubscriptionStatus.suspended);
    }
    return { p, i, c, s };
  }

  it.each([2, 20, 100])(
    '%i mixed webhook/polling/reconciliation processors converge',
    async (size) => {
      const f = await fixture();
      const start = barrier(size);
      const states: State[] = ['PENDING', 'REJECTED', 'APPROVED', 'REFUNDED'];
      const calls = Array.from({ length: size }, (_, index) =>
        start(() =>
          (index % 2 ? serviceA : serviceB).processVerifiedPayment(
            provider,
            payment(f, states[index % states.length], null),
            index % 3 === 0
              ? 'webhook'
              : index % 3 === 1
                ? 'polling'
                : 'reconciliation',
          ),
        ),
      );
      const results = await Promise.allSettled(calls);
      expect(results.every((item) => item.status === 'fulfilled')).toBe(true);
      await assertAggregate(
        f,
        states.includes('REFUNDED') ? 'REFUNDED' : 'APPROVED',
      );
      expect(
        (
          await prismaA.subscription.findUniqueOrThrow({
            where: { id: f.subscription.id },
          })
        ).version,
      ).toBeGreaterThan(1);
    },
    120_000,
  );

  it('older, duplicate and equal-time events are deterministic and observable', async () => {
    const f = await fixture();
    await serviceA.processVerifiedPayment(
      provider,
      payment(f, 'APPROVED', baseTime),
      'webhook',
    );
    const old = new Date(baseTime.getTime() - 1);
    const olderResult = await serviceB.processVerifiedPayment(
      provider,
      payment(f, 'REJECTED', old),
      'polling',
    );
    expect(olderResult).toMatchObject({ applied: false, reason: 'OLDER' });
    const duplicate = await serviceA.processVerifiedPayment(
      provider,
      payment(f, 'APPROVED', baseTime),
      'webhook',
    );
    expect(duplicate).toMatchObject({ applied: false, reason: 'DUPLICATE' });
    await serviceB.processVerifiedPayment(
      provider,
      payment(f, 'REFUNDED', baseTime),
      'reconciliation',
    );
    await assertAggregate(f, 'REFUNDED');
    expect(
      await prismaA.billingEvent.count({
        where: {
          tenantId: f.tenant.id,
          metadata: { path: ['applied'], equals: false },
        },
      }),
    ).toBeGreaterThanOrEqual(2);
  });

  it('all relevant permutations converge with missing provider timestamps', async () => {
    const values: State[] = ['PENDING', 'REJECTED', 'APPROVED', 'REFUNDED'];
    const permutations = (items: State[]): State[][] =>
      items.length === 1
        ? [items]
        : items.flatMap((item, index) =>
            permutations(items.filter((_, i) => i !== index)).map((tail) => [
              item,
              ...tail,
            ]),
          );
    for (const order of permutations(values)) {
      const f = await fixture();
      for (const state of order)
        await serviceA.processVerifiedPayment(
          provider,
          payment(f, state, null),
          'permutation',
        );
      await assertAggregate(f, 'REFUNDED');
    }
  }, 120_000);

  it('uses tenant-scoped aggregate CAS and cannot affect another tenant or branch', async () => {
    const target = await fixture();
    const other = await fixture();
    await Promise.all([
      serviceA.processVerifiedPayment(
        provider,
        payment(target, 'APPROVED'),
        'webhook',
      ),
      serviceB.processVerifiedPayment(
        provider,
        payment(target, 'PENDING'),
        'polling',
      ),
    ]);
    await assertAggregate(target, 'APPROVED');
    const untouched = await prismaA.subscription.findUniqueOrThrow({
      where: { id: other.subscription.id },
    });
    expect(untouched.status).toBe(SubscriptionStatus.payment_pending);
    expect(untouched.version).toBe(1);
    expect(other.branch.tenantId).not.toBe(target.branch.tenantId);
  });

  it('rolls back payment, invoice, checkout and subscription when semantic event persistence fails', async () => {
    const f = await fixture();
    const failing = new PaymentsService(
      prismaA as any,
      {
        create: jest.fn().mockRejectedValue(new Error('injected failure')),
      } as any,
    );
    await expect(
      failing.processVerifiedPayment(
        provider,
        payment(f, 'APPROVED'),
        'rollback-test',
      ),
    ).rejects.toThrow('injected failure');
    expect(
      await prismaA.billingPayment.count({ where: { tenantId: f.tenant.id } }),
    ).toBe(0);
    expect(
      await prismaA.billingInvoice.count({ where: { tenantId: f.tenant.id } }),
    ).toBe(0);
    const [checkout, subscription] = await Promise.all([
      prismaA.checkoutSession.findUniqueOrThrow({
        where: { id: f.checkout.id },
      }),
      prismaA.subscription.findUniqueOrThrow({
        where: { id: f.subscription.id },
      }),
    ]);
    expect(checkout.status).toBe(CheckoutSessionStatus.OPEN);
    expect(subscription.version).toBe(1);
    expect(subscription.status).toBe(SubscriptionStatus.payment_pending);
  });
});
