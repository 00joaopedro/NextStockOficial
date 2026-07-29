import { CanActivate, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { PaymentGatewayProvider, PrismaClient, Role } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { BillingController } from '../../src/billing/billing.controller';
import { CheckoutService } from '../../src/billing/checkout.service';
import { BillingEventsService } from '../../src/billing/billing-events.service';
import { PlansService } from '../../src/billing/plans.service';
import { SubscriptionsService } from '../../src/billing/subscriptions.service';
import { ReconciliationService } from '../../src/billing/reconciliation.service';
import { TenantContextService } from '../../src/tenancy/tenant-context.service';
import { GatewayCheckoutError } from '../../src/billing/gateways/payment-gateway.interface';
import { JwtAuthGuard } from '../../src/auth/jwt-auth.guard';
import { CsrfOriginGuard } from '../../src/security/csrf-origin.guard';
import {
  assertSafeTestDatabaseUrl,
  hasSecurityTestDatabase,
} from '../helpers/test-database.guard';

const databaseSuite =
  hasSecurityTestDatabase() || process.env.CI === 'true'
    ? describe
    : describe.skip;
const KEY = 'rc005-shared-idempotency-key';

type Mode = 'success' | 'pre-network' | 'uncertain';
class FakeGateway {
  readonly provider = PaymentGatewayProvider.MERCADO_PAGO;
  supportsIdempotentCheckoutRecovery = true;
  mode: Mode = 'success';
  gatewayAttemptCount = 0;
  gatewayCreateCallCount = 0;
  inputs: any[] = [];
  private results = new Map<string, any>();
  private delayMs = 100;

  async createCheckout(input: any) {
    this.gatewayAttemptCount += 1;
    this.inputs.push(input);
    if (this.mode === 'pre-network')
      throw new GatewayCheckoutError('configuration unavailable', false);
    const cached = this.results.get(input.idempotencyKey);
    if (cached) return cached;
    this.gatewayCreateCallCount += 1;
    if (this.mode === 'uncertain')
      throw new GatewayCheckoutError('timeout after dispatch', true);
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    const result = {
      checkoutUrl: `https://gateway.test/${input.externalReference}`,
      gatewayCheckoutId: `gateway-${input.externalReference}`,
      gatewaySubscriptionId: `gateway-${input.externalReference}`,
      supportsExternalReference: true,
    };
    this.results.set(input.idempotencyKey, result);
    return result;
  }
}

class FaultCheckoutService extends CheckoutService {
  failAfterResponse = false;
  protected override afterGatewayCheckoutCreated() {
    if (this.failAfterResponse) {
      this.failAfterResponse = false;
      throw new Error('injected failure after gateway response');
    }
    return Promise.resolve();
  }
}

function timeout<T>(promise: Promise<T>, label: string) {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timeout`)), 60_000);
    }),
  ]).finally(() => clearTimeout(timer));
}

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

databaseSuite('RC-005 billing checkout idempotency on PostgreSQL 16', () => {
  let prismaA: PrismaClient;
  let prismaB: PrismaClient;
  const tenantIds: string[] = [];
  const profileIds: string[] = [];
  const planIds: string[] = [];
  const databaseUrl = hasSecurityTestDatabase()
    ? assertSafeTestDatabaseUrl(process.env.SECURITY_TEST_DATABASE_URL)
    : undefined;

  beforeAll(async () => {
    if (!databaseUrl)
      throw new Error('SECURITY_TEST_DATABASE_URL is required for RC-005.');
    process.env.PUBLIC_APP_URL = 'https://app.nextstock.test';
    process.env.BILLING_MODE = 'sandbox';
    const url = new URL(databaseUrl);
    url.searchParams.set('connection_limit', '30');
    url.searchParams.set('pool_timeout', '30');
    prismaA = new PrismaClient({ datasourceUrl: url.toString() });
    prismaB = new PrismaClient({ datasourceUrl: url.toString() });
    await Promise.all([prismaA.$connect(), prismaB.$connect()]);
  });

  afterAll(async () => {
    await prismaA.userProfile.deleteMany({ where: { id: { in: profileIds } } });
    for (const tenantId of tenantIds)
      await prismaA.tenant
        .delete({ where: { id: tenantId } })
        .catch(() => undefined);
    await prismaA.gatewayPlanMapping.deleteMany({
      where: { planId: { in: planIds } },
    });
    await prismaA.plan.deleteMany({ where: { id: { in: planIds } } });
    await Promise.all([prismaA?.$disconnect(), prismaB?.$disconnect()]);
  });

  async function fixture(label = 'fixture') {
    const tenant = await prismaA.tenant.create({
      data: { name: `RC005 ${label}`, slug: `rc005-${randomUUID()}` },
    });
    tenantIds.push(tenant.id);
    const profile = await prismaA.userProfile.create({
      data: {
        id: randomUUID(),
        tenantId: tenant.id,
        primaryTenantId: tenant.id,
        email: `rc005-${randomUUID()}@example.test`,
        name: 'RC005',
        accessNameNormalized: `rc005-${randomUUID()}`,
        role: Role.Admin,
      },
    });
    profileIds.push(profile.id);
    const plan = await prismaA.plan.create({
      data: {
        name: `RC005 ${label}`,
        slug: `rc005-${randomUUID()}`,
        priceCents: 1000,
        gatewayMappings: {
          create: {
            provider: PaymentGatewayProvider.MERCADO_PAGO,
            mode: 'sandbox',
            gatewayPlanId: `plan-${randomUUID()}`,
          },
        },
      },
    });
    planIds.push(plan.id);
    const subscription = await prismaA.subscription.create({
      data: { tenantId: tenant.id, planId: plan.id },
    });
    return { tenant, profile, plan, subscription };
  }

  function service(
    prisma: PrismaClient,
    data: Awaited<ReturnType<typeof fixture>>,
    gateway: FakeGateway,
  ) {
    return new FaultCheckoutService(
      prisma as any,
      {
        resolve: jest.fn().mockResolvedValue({
          tenantId: data.tenant.id,
          userId: data.profile.id,
          role: Role.Admin,
        }),
      } as any,
      { defaultProvider: () => gateway.provider, get: () => gateway } as any,
      new BillingEventsService(prisma as any),
    );
  }

  async function concurrency(size: number) {
    const data = await fixture(`concurrency-${size}`);
    const gateway = new FakeGateway();
    const a = service(prismaA, data, gateway);
    const b = service(prismaB, data, gateway);
    const start = barrier(size);
    const settled = await timeout(
      Promise.allSettled(
        Array.from({ length: size }, (_, index) =>
          start(() =>
            (index % 2 ? a : b).create(undefined, data.plan.slug, KEY),
          ),
        ),
      ),
      `RC-005 ${size}`,
    );
    expect(settled.every((item) => item.status === 'fulfilled')).toBe(true);
    expect(gateway.gatewayCreateCallCount).toBe(1);
    const [intents, sessions] = await Promise.all([
      prismaA.billingCheckoutIntent.findMany({
        where: { tenantId: data.tenant.id },
      }),
      prismaA.checkoutSession.findMany({ where: { tenantId: data.tenant.id } }),
    ]);
    expect(intents).toHaveLength(1);
    expect(sessions).toHaveLength(1);
    expect(
      new Set([intents[0].externalReference, sessions[0].externalReference])
        .size,
    ).toBe(1);
    expect(
      new Set(gateway.inputs.map((input) => input.idempotencyKey)).size,
    ).toBe(1);
    expect(
      settled.every(
        (item: any) => item.value.checkoutId || item.value.recoverable,
      ),
    ).toBe(true);
  }

  it.each([2, 20, 100])(
    '%i simultaneous creates assert gatewayCreateCallCount === 1',
    concurrency,
    70_000,
  );

  it('pre-network failure is retryable and only the valid retry starts external work', async () => {
    const data = await fixture('pre-network');
    const gateway = new FakeGateway();
    const checkout = service(prismaA, data, gateway);
    gateway.mode = 'pre-network';
    await expect(
      checkout.create(undefined, data.plan.slug, KEY),
    ).rejects.toBeInstanceOf(GatewayCheckoutError);
    expect(gateway.gatewayCreateCallCount).toBe(0);
    expect(
      await prismaA.billingCheckoutIntent.findFirstOrThrow({
        where: { tenantId: data.tenant.id },
      }),
    ).toHaveProperty('state', 'FAILED_RETRYABLE');
    gateway.mode = 'success';
    await expect(
      checkout.create(undefined, data.plan.slug, KEY),
    ).resolves.toHaveProperty('status', 'OPEN');
    expect(gateway.gatewayCreateCallCount).toBe(1);
    expect(
      await prismaA.checkoutSession.count({
        where: { tenantId: data.tenant.id },
      }),
    ).toBe(1);
  });

  it('uncertain result remains UNKNOWN and a provider without recovery is not called blindly', async () => {
    const data = await fixture('unknown');
    const gateway = new FakeGateway();
    gateway.mode = 'uncertain';
    gateway.supportsIdempotentCheckoutRecovery = false;
    const checkout = service(prismaA, data, gateway);
    await expect(
      checkout.create(undefined, data.plan.slug, KEY),
    ).rejects.toBeInstanceOf(GatewayCheckoutError);
    const retry = await checkout.create(undefined, data.plan.slug, KEY);
    expect(retry).toMatchObject({ status: 'UNKNOWN', recoverable: false });
    expect(gateway.gatewayCreateCallCount).toBe(1);
    expect(gateway.gatewayAttemptCount).toBe(1);
    expect(
      await prismaA.checkoutSession.count({
        where: { tenantId: data.tenant.id },
      }),
    ).toBe(0);
  });

  it('recovers an authoritative idempotent response after post-response/pre-commit failure', async () => {
    const data = await fixture('post-response');
    const gateway = new FakeGateway();
    const checkout = service(prismaA, data, gateway);
    checkout.failAfterResponse = true;
    await expect(
      checkout.create(undefined, data.plan.slug, KEY),
    ).rejects.toThrow('injected failure');
    const unknown = await prismaA.billingCheckoutIntent.findFirstOrThrow({
      where: { tenantId: data.tenant.id },
    });
    expect(unknown.state).toBe('UNKNOWN');
    await expect(
      checkout.create(undefined, data.plan.slug, KEY),
    ).resolves.toHaveProperty('status', 'OPEN');
    expect(gateway.gatewayCreateCallCount).toBe(1);
    expect(
      new Set(gateway.inputs.map((input) => input.externalReference)).size,
    ).toBe(1);
    expect(
      await prismaA.checkoutSession.count({
        where: { tenantId: data.tenant.id },
      }),
    ).toBe(1);
  });

  it('does not replay a post-response UNKNOWN when provider recovery is unavailable', async () => {
    const data = await fixture('post-response-manual');
    const gateway = new FakeGateway();
    gateway.supportsIdempotentCheckoutRecovery = false;
    const checkout = service(prismaA, data, gateway);
    checkout.failAfterResponse = true;
    await expect(
      checkout.create(undefined, data.plan.slug, KEY),
    ).rejects.toThrow('injected failure');
    await expect(
      checkout.create(undefined, data.plan.slug, KEY),
    ).resolves.toMatchObject({ status: 'UNKNOWN', recoverable: false });
    expect(gateway.gatewayAttemptCount).toBe(1);
    expect(gateway.gatewayCreateCallCount).toBe(1);
    expect(
      await prismaA.checkoutSession.count({
        where: { tenantId: data.tenant.id },
      }),
    ).toBe(0);
  });

  it('isolates identical key text and checkout results between tenants', async () => {
    const one = await fixture('tenant-one');
    const two = await fixture('tenant-two');
    const gateway = new FakeGateway();
    const first = await service(prismaA, one, gateway).create(
      undefined,
      one.plan.slug,
      KEY,
    );
    const second = await service(prismaB, two, gateway).create(
      undefined,
      two.plan.slug,
      KEY,
    );
    expect(first.checkoutId).not.toBe(second.checkoutId);
    expect(
      await prismaA.billingCheckoutIntent.count({
        where: {
          idempotencyKey: KEY,
          tenantId: { in: [one.tenant.id, two.tenant.id] },
        },
      }),
    ).toBe(2);
    await expect(
      service(prismaA, two, gateway).status(undefined, first.checkoutId),
    ).rejects.toThrow('Checkout nao encontrado');
  });

  it('does not use another tenant subscription when the scoped tenant has none', async () => {
    const owner = await fixture('subscription-owner');
    const isolated = await fixture('subscription-isolated');
    await prismaA.subscription.delete({
      where: { id: isolated.subscription.id },
    });
    const gateway = new FakeGateway();
    await expect(
      service(prismaB, isolated, gateway).create(
        undefined,
        owner.plan.slug,
        KEY,
      ),
    ).rejects.toThrow(
      'Tenant sem subscription. Execute o backfill de billing antes do checkout.',
    );
    expect(gateway.gatewayAttemptCount).toBe(0);
    expect(
      await prismaA.billingCheckoutIntent.count({
        where: { tenantId: isolated.tenant.id },
      }),
    ).toBe(0);
  });

  it('returns HTTP 409 for divergent payload through the real checkout route', async () => {
    const data = await fixture('http-409');
    const otherPlan = await prismaA.plan.create({
      data: {
        name: 'RC005 other',
        slug: `rc005-${randomUUID()}`,
        priceCents: 2000,
        gatewayMappings: {
          create: {
            provider: PaymentGatewayProvider.MERCADO_PAGO,
            mode: 'sandbox',
            gatewayPlanId: `plan-${randomUUID()}`,
          },
        },
      },
    });
    planIds.push(otherPlan.id);
    const gateway = new FakeGateway();
    const checkout = service(prismaA, data, gateway);
    const allow: CanActivate = {
      canActivate: (context) => {
        context.switchToHttp().getRequest().user = {};
        return true;
      },
    };
    const module = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [
        { provide: CheckoutService, useValue: checkout },
        { provide: 'unused', useValue: {} },
        { provide: PlansService, useValue: {} },
        { provide: SubscriptionsService, useValue: {} },
        { provide: ReconciliationService, useValue: {} },
        { provide: TenantContextService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(allow)
      .overrideGuard(CsrfOriginGuard)
      .useValue(allow)
      .compile();
    const app: INestApplication = module.createNestApplication(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.listen(0, '127.0.0.1');
    try {
      await request(app.getHttpServer())
        .post('/api/billing/checkout')
        .set('Idempotency-Key', KEY)
        .send({ planSlug: data.plan.slug })
        .expect(201);
      const response = await request(app.getHttpServer())
        .post('/api/billing/checkout')
        .set('Idempotency-Key', KEY)
        .send({ planSlug: otherPlan.slug })
        .expect(409);
      expect(response.body.message).toBe(
        'Idempotency-Key reutilizada com payload divergente.',
      );
      expect(gateway.gatewayCreateCallCount).toBe(1);
      expect(
        await prismaA.billingCheckoutIntent.count({
          where: { tenantId: data.tenant.id },
        }),
      ).toBe(1);
      expect(
        await prismaA.checkoutSession.count({
          where: { tenantId: data.tenant.id },
        }),
      ).toBe(1);
    } finally {
      await app.close();
    }
  });
});
