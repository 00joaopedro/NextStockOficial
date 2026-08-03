import {
  AuditOutcome,
  FulfillmentType,
  OrderPaymentMethod,
  OrderSource,
  OrderStatus,
  PrismaClient,
  StorefrontStatus,
} from '@prisma/client';
import { ConflictException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { AuditOutboxService } from '../../src/audit/audit-outbox.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PublicRateLimitGuard } from '../../src/security/public-rate-limit.guard';
import { StorefrontPublicController } from '../../src/storefront/storefront.controller';
import { CreateGuestOrderDto } from '../../src/storefront/dto/storefront-public.dto';
import { StorefrontService } from '../../src/storefront/storefront.service';
import {
  createBranch,
  createProduct,
  createTenant,
} from '../factories/security.factory';

const databaseUrl = process.env.SECURITY_TEST_DATABASE_URL;
const ACTIVE = [OrderStatus.pending, OrderStatus.preparing, OrderStatus.paid];

type ServicePair = { serviceA: StorefrontService; serviceB: StorefrontService };

describe('RC-015 through the real StorefrontService', () => {
  type Fixture = Awaited<ReturnType<typeof createFixture>>;

  const prismaA = new PrismaClient({ datasourceUrl: databaseUrl });
  const prismaB = new PrismaClient({ datasourceUrl: databaseUrl });
  const originalOrdering = process.env.STOREFRONT_ORDERING_ENABLED;
  const originalReading = process.env.STOREFRONT_PUBLIC_READ_ENABLED;
  const originalTokenSecret = process.env.STOREFRONT_TOKEN_SECRET;

  beforeAll(() => {
    process.env.STOREFRONT_ORDERING_ENABLED = 'true';
    process.env.STOREFRONT_PUBLIC_READ_ENABLED = 'true';
    process.env.STOREFRONT_TOKEN_SECRET =
      'rc015-test-secret-at-least-thirty-two-characters';
  });

  afterAll(async () => {
    if (originalOrdering === undefined)
      delete process.env.STOREFRONT_ORDERING_ENABLED;
    else process.env.STOREFRONT_ORDERING_ENABLED = originalOrdering;
    if (originalReading === undefined)
      delete process.env.STOREFRONT_PUBLIC_READ_ENABLED;
    else process.env.STOREFRONT_PUBLIC_READ_ENABLED = originalReading;
    if (originalTokenSecret === undefined)
      delete process.env.STOREFRONT_TOKEN_SECRET;
    else process.env.STOREFRONT_TOKEN_SECRET = originalTokenSecret;
    await Promise.all([prismaA.$disconnect(), prismaB.$disconnect()]);
  });

  it.each([
    [0, 2],
    [0, 20],
    [0, 50],
    [0, 100],
    [2, 2],
    [2, 20],
    [2, 50],
    [2, 100],
  ])(
    'enforces exact winners from initial=%i across %i distinct keys and two replicas',
    async (initial, requests) => {
      const fixture = await createFixture(500);
      await seedActiveOrders(fixture, initial);
      const services = createServices();
      const beforeOutbox = await successfulOutboxCount(fixture);
      const results = await runConcurrent(services, fixture, requests);
      const winners = results.filter(isFulfilled);
      const losers = results.filter(isRejected);
      const expected = Math.min(requests, 3 - initial);

      expect(winners).toHaveLength(expected);
      expect(
        new Set(winners.map((item) => item.value.order.reference)).size,
      ).toBe(expected);
      expect(losers).toHaveLength(requests - expected);
      for (const loser of losers)
        expect(loser.reason).toBeInstanceOf(ConflictException);
      expect(await activeCount(fixture)).toBe(initial + expected);
      const newOrders = await prismaA.order.findMany({
        where: {
          storefrontId: fixture.storefront.id,
          idempotencyKeyHash: { not: null },
        },
        include: { items: true },
      });
      expect(newOrders).toHaveLength(expected);
      expect(newOrders.every((order) => order.items.length === 1)).toBe(true);
      expect(await productQuantity(fixture)).toBe(500 - expected);
      expect((await successfulOutboxCount(fixture)) - beforeOutbox).toBe(
        expected,
      );
    },
    60_000,
  );

  it.each([2, 20, 100])(
    'converges %i concurrent retries with the same key to one order',
    async (requests) => {
      const fixture = await createFixture(200);
      const services = createServices();
      const key = idempotencyKey();
      const beforeOutbox = await successfulOutboxCount(fixture);
      const results = await runConcurrent(
        services,
        fixture,
        requests,
        () => key,
      );
      expect(results.every(isFulfilled)).toBe(true);
      const references = results
        .filter(isFulfilled)
        .map((item) => item.value.order.reference);
      expect(new Set(references).size).toBe(1);
      expect(await activeCount(fixture)).toBe(1);
      expect(await productQuantity(fixture)).toBe(199);
      expect((await successfulOutboxCount(fixture)) - beforeOutbox).toBe(1);
    },
    60_000,
  );

  it.each([false, true])(
    'returns a domain conflict for divergent payloads regardless of arrival order',
    async (reverse) => {
      const fixture = await createFixture(20);
      const services = createServices();
      const key = idempotencyKey();
      const first = buildDto(fixture, reverse ? 2 : 1);
      const second = buildDto(fixture, reverse ? 1 : 2);
      const results = await Promise.allSettled([
        services.serviceA.createGuestOrder(
          fixture.storefront.publicSlug,
          key,
          first,
          {},
        ),
        services.serviceB.createGuestOrder(
          fixture.storefront.publicSlug,
          key,
          second,
          {},
        ),
      ]);
      expect(results.filter(isFulfilled)).toHaveLength(1);
      const rejected = results.filter(isRejected);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(ConflictException);
      const order = await prismaA.order.findMany({
        where: {
          storefrontId: fixture.storefront.id,
          idempotencyKeyHash: { not: null },
        },
        include: { items: true },
      });
      expect(order).toHaveLength(1);
      expect(await productQuantity(fixture)).toBe(
        20 - order[0].items[0].quantity,
      );
      expect(await successfulOutboxCount(fixture)).toBe(1);
    },
  );

  it('maps a concurrent P2002 from the expected idempotency constraint to conflict, not false success', async () => {
    const fixture = await createFixture(20);
    const services = createServices();
    const key = idempotencyKey();
    const results = await Promise.allSettled([
      services.serviceA.createGuestOrder(
        fixture.storefront.publicSlug,
        key,
        buildDto(fixture),
        {},
      ),
      services.serviceB.createGuestOrder(
        fixture.storefront.publicSlug,
        key,
        { ...buildDto(fixture), customerPhone: '11999990001' },
        {},
      ),
    ]);
    expect(results.filter(isFulfilled)).toHaveLength(1);
    const rejected = results.filter(isRejected);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    expect(await productQuantity(fixture)).toBe(19);
    expect(await successfulOutboxCount(fixture)).toBe(1);
  });

  it('rolls back a real outbox insert and stock, releases the xact lock, then permits a retry', async () => {
    const fixture = await createFixture(10);
    const realOutbox = new AuditOutboxService(
      prismaA as unknown as PrismaService,
    );
    let fail = true;
    const failingOutbox = Object.create(realOutbox) as AuditOutboxService;
    failingOutbox.enqueue = async (
      ...args: Parameters<AuditOutboxService['enqueue']>
    ) => {
      const event = await realOutbox.enqueue(...args);
      if (fail) {
        fail = false;
        throw new Error('RC015_DETERMINISTIC_ROLLBACK');
      }
      return event;
    };
    const serviceA = createService(prismaA, failingOutbox);
    const serviceB = createService(prismaB);
    await expect(
      serviceA.createGuestOrder(
        fixture.storefront.publicSlug,
        idempotencyKey(),
        buildDto(fixture),
        {},
      ),
    ).rejects.toThrow('RC015_DETERMINISTIC_ROLLBACK');
    expect(await activeCount(fixture)).toBe(0);
    expect(await productQuantity(fixture)).toBe(10);
    expect(await successfulOutboxCount(fixture)).toBe(0);
    await expect(
      serviceB.createGuestOrder(
        fixture.storefront.publicSlug,
        idempotencyKey(),
        buildDto(fixture),
        {},
      ),
    ).resolves.toBeDefined();
    expect(await activeCount(fixture)).toBe(1);
    expect(await productQuantity(fixture)).toBe(9);
    expect(await successfulOutboxCount(fixture)).toBe(1);
  });

  it.each([
    [OrderStatus.pending, true],
    [OrderStatus.preparing, true],
    [OrderStatus.paid, true],
    [OrderStatus.delivered, false],
    [OrderStatus.canceled, false],
    [OrderStatus.refunded, false],
  ])('counts status %s = %s', async (status, counts) => {
    const fixture = await createFixture(20);
    await seedOrders(fixture, 3, { status });
    const result = createServices().serviceA.createGuestOrder(
      fixture.storefront.publicSlug,
      idempotencyKey(),
      buildDto(fixture),
      {},
    );
    if (counts) await expect(result).rejects.toBeInstanceOf(ConflictException);
    else await expect(result).resolves.toBeDefined();
  });

  it('excludes soft-deleted and orders outside the rolling window', async () => {
    const fixture = await createFixture(20);
    await seedOrders(fixture, 2, { deletedAt: new Date() });
    await seedOrders(fixture, 2, {
      createdAt: new Date('2000-01-01T00:00:00.000Z'),
    });
    await expect(
      createServices().serviceA.createGuestOrder(
        fixture.storefront.publicSlug,
        idempotencyKey(),
        buildDto(fixture),
        {},
      ),
    ).resolves.toBeDefined();
  });

  it('uses an inclusive deterministic cutoff and excludes one millisecond before it', async () => {
    const fixture = await createFixture(20);
    const operationTime = new Date('2026-08-03T12:00:00.000Z');
    const cutoff = new Date(operationTime.getTime() - 30 * 86400000);
    await seedOrders(fixture, 2, { createdAt: cutoff });
    await seedOrders(fixture, 20, {
      createdAt: new Date(cutoff.getTime() - 1),
    });
    const services = createServices();
    for (const service of [services.serviceA, services.serviceB])
      (
        service as unknown as { guestOrderOperationTime: () => Promise<Date> }
      ).guestOrderOperationTime = () => Promise.resolve(operationTime);
    await expect(
      services.serviceA.createGuestOrder(
        fixture.storefront.publicSlug,
        idempotencyKey(),
        buildDto(fixture),
        {},
      ),
    ).resolves.toBeDefined();
    await expect(
      services.serviceB.createGuestOrder(
        fixture.storefront.publicSlug,
        idempotencyKey(),
        buildDto(fixture),
        {},
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('keeps tenant/storefront/branch scopes independent for the same phone', async () => {
    const first = await createFixture(20);
    const second = await createFixture(20);
    await seedActiveOrders(first, 3);
    const services = createServices();
    await expect(
      services.serviceA.createGuestOrder(
        first.storefront.publicSlug,
        idempotencyKey(),
        buildDto(first),
        {},
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      services.serviceB.createGuestOrder(
        second.storefront.publicSlug,
        idempotencyKey(),
        buildDto(second),
        {},
      ),
    ).resolves.toBeDefined();
    expect(await activeCount(first)).toBe(3);
    expect(await activeCount(second)).toBe(1);
  });

  it('keeps create versus public cancellation safe and restores stock once', async () => {
    const fixture = await createFixture(20);
    const services = createServices();
    await seedActiveOrders(fixture, 2);
    const created = await services.serviceA.createGuestOrder(
      fixture.storefront.publicSlug,
      idempotencyKey(),
      buildDto(fixture),
      {},
    );
    const results = await Promise.allSettled([
      services.serviceA.createGuestOrder(
        fixture.storefront.publicSlug,
        idempotencyKey(),
        buildDto(fixture),
        {},
      ),
      services.serviceB.cancelGuestOrder(
        fixture.storefront.publicSlug,
        created.order.reference,
        created.order.trackingToken,
        {},
      ),
    ]);
    expect(results.some(isFulfilled)).toBe(true);
    expect(await activeCount(fixture)).toBeLessThanOrEqual(3);
    const newActive = await prismaA.order.count({
      where: {
        storefrontId: fixture.storefront.id,
        idempotencyKeyHash: { not: null },
        status: { in: ACTIVE },
      },
    });
    expect(await productQuantity(fixture)).toBe(20 - newActive);
  });

  it('keeps create versus expiration safe and restores an expired reservation once', async () => {
    const fixture = await createFixture(20);
    const services = createServices();
    await seedActiveOrders(fixture, 2);
    const expiring = await services.serviceA.createGuestOrder(
      fixture.storefront.publicSlug,
      idempotencyKey(),
      buildDto(fixture),
      {},
    );
    await prismaA.order.update({
      where: { publicReference: expiring.order.reference },
      data: { reservationExpiresAt: new Date('2000-01-01T00:00:00.000Z') },
    });
    const results = await Promise.allSettled([
      services.serviceA.createGuestOrder(
        fixture.storefront.publicSlug,
        idempotencyKey(),
        buildDto(fixture),
        {},
      ),
      services.serviceB.createGuestOrder(
        fixture.storefront.publicSlug,
        idempotencyKey(),
        buildDto(fixture),
        {},
      ),
    ]);
    expect(results.filter(isFulfilled)).toHaveLength(1);
    expect(await activeCount(fixture)).toBe(3);
    expect(await productQuantity(fixture)).toBe(19);
    const expired = await prismaA.order.findUniqueOrThrow({
      where: { publicReference: expiring.order.reference },
    });
    expect(expired.status).toBe(OrderStatus.canceled);
    expect(expired.stockRestoredAt).toBeInstanceOf(Date);
  });

  it('returns HTTP 409, never 500, for concurrent limit and idempotency conflicts', async () => {
    const fixture = await createFixture(20);
    const idempotencyFixture = await createFixture(20);
    await seedActiveOrders(fixture, 2);
    const service = createServices().serviceA;
    let app: NestFastifyApplication | undefined;
    try {
      const moduleRef = await Test.createTestingModule({
        controllers: [StorefrontPublicController],
        providers: [{ provide: StorefrontService, useValue: service }],
      })
        .overrideGuard(PublicRateLimitGuard)
        .useValue({ canActivate: () => true })
        .compile();
      app = moduleRef.createNestApplication<NestFastifyApplication>(
        new FastifyAdapter(),
      );
      app.setGlobalPrefix('api');
      app.useGlobalPipes(
        new ValidationPipe({ transform: true, whitelist: true }),
      );
      await app.listen(0, '127.0.0.1');
      const endpoint = `/api/public/storefronts/${fixture.storefront.publicSlug}/orders`;
      const [one, two] = await Promise.all([
        request(app.getHttpServer())
          .post(endpoint)
          .set('Idempotency-Key', idempotencyKey())
          .send(buildDto(fixture)),
        request(app.getHttpServer())
          .post(endpoint)
          .set('Idempotency-Key', idempotencyKey())
          .send(buildDto(fixture)),
      ]);
      expect([one.status, two.status].sort()).toEqual([201, 409]);
      const idempotencyEndpoint = `/api/public/storefronts/${idempotencyFixture.storefront.publicSlug}/orders`;
      const divergentKey = idempotencyKey();
      expect(
        (
          await request(app.getHttpServer())
            .post(idempotencyEndpoint)
            .set('Idempotency-Key', divergentKey)
            .send(buildDto(idempotencyFixture))
        ).status,
      ).toBe(201);
      const replay = await request(app.getHttpServer())
        .post(idempotencyEndpoint)
        .set('Idempotency-Key', divergentKey)
        .send(buildDto(idempotencyFixture));
      expect(replay.status).toBe(201);
      expect(
        (
          await request(app.getHttpServer())
            .post(idempotencyEndpoint)
            .set('Idempotency-Key', divergentKey)
            .send(buildDto(idempotencyFixture, 2))
        ).status,
      ).toBe(409);
    } finally {
      if (app) await app.close();
    }
  });

  function createServices(): ServicePair {
    return {
      serviceA: createService(prismaA),
      serviceB: createService(prismaB),
    };
  }

  function createService(
    prisma: PrismaClient,
    outbox = new AuditOutboxService(prisma as unknown as PrismaService),
  ) {
    return new StorefrontService(
      prisma as unknown as PrismaService,
      {} as never,
      {
        forTenant: () => Promise.resolve({ allowed: true, subscription: {} }),
      } as never,
      {} as never,
      outbox,
    );
  }

  async function createFixture(stock: number) {
    const tenant = await createTenant(prismaA);
    const branch = await createBranch(prismaA, tenant);
    const product = await createProduct(prismaA, { tenant, branch });
    await prismaA.product.update({
      where: { id: product.id },
      data: { quantity: stock },
    });
    const storefront = await prismaA.storefront.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        publicSlug: `rc015-${randomUUID()}`,
        publicName: 'RC-015',
        status: StorefrontStatus.active,
        orderingEnabled: true,
        pickupEnabled: true,
      },
    });
    const listing = await prismaA.storefrontProduct.create({
      data: {
        storefrontId: storefront.id,
        productId: product.id,
        publicSlug: `product-${randomUUID()}`,
        isPublished: true,
        availableForOnlineOrder: true,
      },
    });
    return {
      tenant,
      branch,
      product,
      storefront,
      listing,
      phone: '11999990000',
    };
  }

  function buildDto(fixture: Fixture, quantity = 1): CreateGuestOrderDto {
    return {
      customerName: 'RC-015 Customer',
      customerPhone: fixture.phone,
      fulfillmentType: FulfillmentType.pickup,
      items: [{ productSlug: fixture.listing.publicSlug, quantity }],
    };
  }

  async function seedActiveOrders(fixture: Fixture, count: number) {
    return seedOrders(fixture, count, { status: OrderStatus.pending });
  }

  async function seedOrders(
    fixture: Fixture,
    count: number,
    override: { status?: OrderStatus; createdAt?: Date; deletedAt?: Date } = {},
  ) {
    for (let index = 0; index < count; index += 1)
      await prismaA.order.create({
        data: {
          tenantId: fixture.tenant.id,
          branchId: fixture.branch.id,
          storefrontId: fixture.storefront.id,
          source: OrderSource.storefront_guest,
          publicReference: `RC015-SEED-${randomUUID()}-${index}`,
          customerName: 'Existing customer',
          customerPhone: fixture.phone,
          paymentMethod: OrderPaymentMethod.other,
          status: override.status ?? OrderStatus.pending,
          subtotalCents: 100,
          totalCents: 100,
          createdAt: override.createdAt,
          deletedAt: override.deletedAt,
        },
      });
  }

  function runConcurrent(
    services: ServicePair,
    fixture: Fixture,
    count: number,
    keyAt: (index: number) => string = () => idempotencyKey(),
  ) {
    return Promise.allSettled(
      Array.from({ length: count }, (_, index) =>
        (index % 2 ? services.serviceB : services.serviceA).createGuestOrder(
          fixture.storefront.publicSlug,
          keyAt(index),
          buildDto(fixture),
          { requestId: `rc015-${index}` },
        ),
      ),
    );
  }

  function activeCount(fixture: Fixture) {
    return prismaA.order.count({
      where: {
        tenantId: fixture.tenant.id,
        branchId: fixture.branch.id,
        storefrontId: fixture.storefront.id,
        customerPhone: fixture.phone,
        source: OrderSource.storefront_guest,
        status: { in: ACTIVE },
        deletedAt: null,
        createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
      },
    });
  }

  async function productQuantity(fixture: Fixture) {
    return (
      await prismaA.product.findUniqueOrThrow({
        where: { id: fixture.product.id },
      })
    ).quantity;
  }

  function successfulOutboxCount(fixture: Fixture) {
    return prismaA.auditOutboxEvent.count({
      where: {
        tenantId: fixture.tenant.id,
        branchId: fixture.branch.id,
        eventType: 'storefront.order_created',
        outcome: AuditOutcome.SUCCESS,
      },
    });
  }
});

function idempotencyKey() {
  return `rc015-${randomUUID()}`;
}

function isFulfilled<T>(
  result: PromiseSettledResult<T>,
): result is PromiseFulfilledResult<T> {
  return result.status === 'fulfilled';
}

function isRejected<T>(
  result: PromiseSettledResult<T>,
): result is PromiseRejectedResult {
  return result.status === 'rejected';
}
