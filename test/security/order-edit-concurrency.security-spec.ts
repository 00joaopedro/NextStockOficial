import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderPaymentMethod,
  OrderStatus,
  PrismaClient,
  Role,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { OrdersService } from '../../src/orders/orders.service';
import { assertSafeTestDatabaseUrl } from '../helpers/test-database.guard';

const INITIAL_STOCK = 200;

function service(prisma: PrismaClient, tenantId: string, branchId: string) {
  return new OrdersService(
    prisma as any,
    {
      resolve: jest.fn().mockResolvedValue({
        tenantId,
        branchId,
        role: Role.Admin,
        contextKind: 'normal',
      }),
    } as any,
    { createFromOrder: jest.fn(), receiptByOrder: jest.fn() } as any,
  );
}

function barrier(size: number) {
  let waiting = 0;
  let release!: () => void;
  const open = new Promise<void>((resolve) => {
    release = resolve;
  });
  return async <T>(work: () => Promise<T>) => {
    waiting += 1;
    if (waiting === size) release();
    await open;
    return work();
  };
}

async function withTimeout<T>(promise: Promise<T>, label: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout`)), 60_000);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

describe('RC-006 order edit CAS on PostgreSQL 16', () => {
  let prismaA: PrismaClient;
  let prismaB: PrismaClient;
  const tenantIds = new Set<string>();

  beforeAll(async () => {
    const databaseUrl = assertSafeTestDatabaseUrl(
      process.env.SECURITY_TEST_DATABASE_URL,
    );
    const url = new URL(databaseUrl);
    url.searchParams.set('connection_limit', '60');
    url.searchParams.set('pool_timeout', '30');
    prismaA = new PrismaClient({ datasourceUrl: url.toString() });
    prismaB = new PrismaClient({ datasourceUrl: url.toString() });
    await Promise.all([prismaA.$connect(), prismaB.$connect()]);
  });

  afterAll(async () => {
    try {
      // Audit events intentionally outlive their mutable fixtures. Their
      // identifier columns have no foreign keys and the disposable CI database
      // is destroyed after the job, so the append-only log must not be deleted.
      await prismaA.order.deleteMany({
        where: { tenantId: { in: [...tenantIds] } },
      });
      await prismaA.product.deleteMany({
        where: { tenantId: { in: [...tenantIds] } },
      });
      await prismaA.branch.deleteMany({
        where: { tenantId: { in: [...tenantIds] } },
      });
      await prismaA.tenant.deleteMany({
        where: { id: { in: [...tenantIds] } },
      });
    } finally {
      await Promise.all([prismaA?.$disconnect(), prismaB?.$disconnect()]);
    }
  });

  async function fixture(stock = INITIAL_STOCK) {
    const tenant = await prismaA.tenant.create({
      data: { name: 'RC-006 tenant', slug: `rc006-${randomUUID()}` },
    });
    tenantIds.add(tenant.id);
    const branch = await prismaA.branch.create({
      data: {
        tenantId: tenant.id,
        name: 'RC-006 branch',
        slug: randomUUID(),
        isDefault: true,
      },
    });
    const product = await prismaA.product.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        name: 'RC-006 product',
        costPriceCents: 100,
        profitPercent: 100,
        salePriceCents: 200,
        quantity: stock - 1,
      },
    });
    const order = await prismaA.order.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        customerName: 'RC-006 customer',
        paymentMethod: OrderPaymentMethod.other,
        status: OrderStatus.pending,
        subtotalCents: 200,
        totalCents: 200,
        items: {
          create: {
            productId: product.id,
            productNameSnapshot: product.name,
            quantity: 1,
            unitPriceCents: 200,
            totalPriceCents: 200,
          },
        },
      },
    });
    return { tenant, branch, product, order };
  }

  async function concurrentEdits(size: number) {
    const data = await fixture();
    const services = [
      service(prismaA, data.tenant.id, data.branch.id),
      service(prismaB, data.tenant.id, data.branch.id),
    ];
    const start = barrier(size);
    const calls = Array.from({ length: size }, (_, index) =>
      start(() =>
        services[index % 2].update(undefined, data.order.id, {
          expectedVersion: 1,
          items: [{ productId: data.product.id, quantity: index + 2 }],
        }),
      ),
    );
    const results = await withTimeout(
      Promise.allSettled(calls),
      `${size} edits`,
    );
    const winners = results.filter((result) => result.status === 'fulfilled');
    const losers = results.filter((result) => result.status === 'rejected');
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(size - 1);
    for (const loser of losers) {
      expect(loser.reason).toBeInstanceOf(ConflictException);
    }

    const [order, product, auditCount] = await Promise.all([
      prismaA.order.findUniqueOrThrow({
        where: { id: data.order.id },
        include: { items: true },
      }),
      prismaA.product.findUniqueOrThrow({ where: { id: data.product.id } }),
      prismaA.securityAuditEvent.count({
        where: { eventType: 'order.admin_updated', targetId: data.order.id },
      }),
    ]);
    expect(order.version).toBe(2);
    expect(order.items).toHaveLength(1);
    expect(order.subtotalCents).toBe(order.items[0].quantity * 200);
    expect(order.totalCents).toBe(order.subtotalCents);
    expect(product.quantity).toBe(INITIAL_STOCK - order.items[0].quantity);
    expect(product.quantity).toBeGreaterThanOrEqual(0);
    expect(auditCount).toBe(1);
    return { ...data, order, product, service: services[0] };
  }

  it.each([2, 20, 100])(
    '%i divergent edits have one winner and coherent stock/items/totals',
    async (size) => {
      await concurrentEdits(size);
    },
    70_000,
  );

  it('allows a retry only after reloading the winning version', async () => {
    const data = await concurrentEdits(2);
    await expect(
      data.service.update(undefined, data.order.id, {
        expectedVersion: 1,
        items: [{ productId: data.product.id, quantity: 5 }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      data.service.update(undefined, data.order.id, {
        expectedVersion: data.order.version,
        items: [{ productId: data.product.id, quantity: 5 }],
      }),
    ).resolves.toMatchObject({ order: { version: 3, totalCents: 1000 } });
    expect(
      await prismaA.product.findUniqueOrThrow({
        where: { id: data.product.id },
      }),
    ).toHaveProperty('quantity', INITIAL_STOCK - 5);
  });

  it('rolls back the CAS, first product update and item replacement on a later stock failure', async () => {
    const data = await fixture(10);
    const second = await prismaA.product.create({
      data: {
        tenantId: data.tenant.id,
        branchId: data.branch.id,
        name: 'RC-006 empty product',
        costPriceCents: 100,
        profitPercent: 100,
        salePriceCents: 300,
        quantity: 0,
      },
    });
    await expect(
      service(prismaA, data.tenant.id, data.branch.id).update(
        undefined,
        data.order.id,
        {
          expectedVersion: 1,
          items: [
            { productId: data.product.id, quantity: 2 },
            { productId: second.id, quantity: 1 },
          ],
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    const unchanged = await prismaA.order.findUniqueOrThrow({
      where: { id: data.order.id },
      include: { items: true },
    });
    expect(unchanged).toMatchObject({
      version: 1,
      subtotalCents: 200,
      totalCents: 200,
    });
    expect(unchanged.items).toHaveLength(1);
    expect(
      await prismaA.product.findUniqueOrThrow({
        where: { id: data.product.id },
      }),
    ).toHaveProperty('quantity', 9);
    expect(
      await prismaA.securityAuditEvent.count({
        where: { targetId: data.order.id },
      }),
    ).toBe(0);
  });

  it('does not reveal or mutate an order through another tenant or branch', async () => {
    const data = await fixture();
    const other = await fixture();
    await expect(
      service(prismaA, other.tenant.id, other.branch.id).update(
        undefined,
        data.order.id,
        {
          expectedVersion: 1,
          items: [{ productId: other.product.id, quantity: 2 }],
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service(prismaA, data.tenant.id, other.branch.id).update(
        undefined,
        data.order.id,
        {
          expectedVersion: 1,
          items: [{ productId: data.product.id, quantity: 2 }],
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      await prismaA.order.findUniqueOrThrow({ where: { id: data.order.id } }),
    ).toHaveProperty('version', 1);
    expect(
      await prismaA.product.findUniqueOrThrow({
        where: { id: data.product.id },
      }),
    ).toHaveProperty('quantity', INITIAL_STOCK - 1);
  });
});
