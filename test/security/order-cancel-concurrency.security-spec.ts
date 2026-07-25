import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  OrderPaymentMethod,
  OrderStatus,
  PrismaClient,
  Role,
  SaleStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { OrdersService } from '../../src/orders/orders.service';
import {
  assertSafeTestDatabaseUrl,
  hasSecurityTestDatabase,
} from '../helpers/test-database.guard';

const runDatabaseSuite =
  hasSecurityTestDatabase() || process.env.CI === 'true'
    ? describe
    : describe.skip;

const INITIAL_STOCK = 50;
const RESERVED_STOCK = 7;

function barrier(size: number) {
  let entered = 0;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  return async <T>(work: () => Promise<T>) => {
    entered += 1;
    if (entered === size) release();
    await ready;
    return work();
  };
}

async function withTimeout<T>(promise: Promise<T>, label: string) {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout`)), 60_000);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function service(prisma: PrismaClient, tenantId: string, branchId: string) {
  const tenantContext = {
    resolve: jest.fn().mockResolvedValue({
      tenantId,
      branchId,
      userId: undefined,
      role: Role.Admin,
      contextKind: 'normal',
    }),
  };
  return new OrdersService(
    prisma as any,
    tenantContext as any,
    { createFromOrder: jest.fn(), receiptByOrder: jest.fn() } as any,
  );
}

runDatabaseSuite(
  'RC-003 administrative order cancellation on PostgreSQL',
  () => {
    let prismaA: PrismaClient;
    let prismaB: PrismaClient;
    const tenantIds = new Set<string>();
    const databaseUrl = hasSecurityTestDatabase()
      ? assertSafeTestDatabaseUrl(process.env.SECURITY_TEST_DATABASE_URL)
      : undefined;

    beforeAll(async () => {
      if (!databaseUrl) {
        throw new Error(
          'SECURITY_TEST_DATABASE_URL is required for RC-003 concurrency tests.',
        );
      }
      const url = new URL(databaseUrl);
      url.searchParams.set('connection_limit', '20');
      url.searchParams.set('pool_timeout', '30');
      prismaA = new PrismaClient({ datasourceUrl: url.toString() });
      prismaB = new PrismaClient({ datasourceUrl: url.toString() });
      await Promise.all([prismaA.$connect(), prismaB.$connect()]);
    });

    afterAll(async () => {
      for (const tenantId of tenantIds) {
        await prismaA.sale.deleteMany({ where: { tenantId } });
        await prismaA.order.deleteMany({ where: { tenantId } });
        await prismaA.product.deleteMany({ where: { tenantId } });
        await prismaA.branch.deleteMany({ where: { tenantId } });
        await prismaA.tenant.deleteMany({ where: { id: tenantId } });
      }
      await Promise.all([prismaA?.$disconnect(), prismaB?.$disconnect()]);
    });

    async function fixture() {
      const tenant = await prismaA.tenant.create({
        data: { name: 'RC-003 tenant', slug: `rc003-${randomUUID()}` },
      });
      tenantIds.add(tenant.id);
      const branch = await prismaA.branch.create({
        data: {
          tenantId: tenant.id,
          name: 'RC-003 branch',
          slug: `rc003-${randomUUID()}`,
          isDefault: true,
        },
      });
      const product = await prismaA.product.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          name: 'RC-003 product',
          costPriceCents: 100,
          profitPercent: 100,
          salePriceCents: 200,
          quantity: INITIAL_STOCK - RESERVED_STOCK,
        },
      });
      const order = await prismaA.order.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          customerName: 'RC-003 customer',
          paymentMethod: OrderPaymentMethod.other,
          status: OrderStatus.pending,
          subtotalCents: RESERVED_STOCK * 200,
          totalCents: RESERVED_STOCK * 200,
          items: {
            create: {
              productId: product.id,
              productNameSnapshot: product.name,
              quantity: RESERVED_STOCK,
              unitPriceCents: 200,
              totalPriceCents: RESERVED_STOCK * 200,
            },
          },
        },
      });
      return { tenant, branch, product, order };
    }

    async function cancelConcurrently(size: number) {
      const data = await fixture();
      const serviceA = service(prismaA, data.tenant.id, data.branch.id);
      const serviceB = service(prismaB, data.tenant.id, data.branch.id);
      const start = barrier(size);
      const calls = Array.from({ length: size }, (_, index) =>
        start(() =>
          (index % 2 === 0 ? serviceA : serviceB).cancel(
            undefined,
            data.order.id,
            {
              cancellationReason: 'RC-003 concurrent cancellation',
            },
          ),
        ),
      );
      const results = await withTimeout(
        Promise.allSettled(calls),
        `RC-003 ${size}-call`,
      );
      expect(results.every((result) => result.status === 'fulfilled')).toBe(
        true,
      );

      const [product, order, auditCount] = await Promise.all([
        prismaA.product.findUniqueOrThrow({ where: { id: data.product.id } }),
        prismaA.order.findUniqueOrThrow({ where: { id: data.order.id } }),
        prismaA.securityAuditEvent.count({
          where: {
            eventType: 'order.admin_canceled',
            targetId: data.order.id,
          },
        }),
      ]);
      expect(product.quantity).toBe(INITIAL_STOCK);
      expect(order.status).toBe(OrderStatus.canceled);
      expect(order.stockRestoredAt).toBeInstanceOf(Date);
      expect(auditCount).toBe(1);

      const restoredAt = order.stockRestoredAt?.getTime();
      await serviceA.cancel(undefined, data.order.id, {
        cancellationReason: 'idempotent retry',
      });
      const retried = await prismaA.order.findUniqueOrThrow({
        where: { id: data.order.id },
      });
      expect(
        await prismaA.product.findUniqueOrThrow({
          where: { id: data.product.id },
        }),
      ).toHaveProperty('quantity', INITIAL_STOCK);
      expect(retried.stockRestoredAt?.getTime()).toBe(restoredAt);
      return { ...data, serviceA };
    }

    it.each([2, 20, 100])(
      '%i simultaneous cancellations restore exactly once and remain idempotent',
      async (size) => {
        await cancelConcurrently(size);
      },
      70_000,
    );

    it('does not cancel or restore an order with an existing sale', async () => {
      const data = await fixture();
      await prismaA.sale.create({
        data: {
          tenantId: data.tenant.id,
          branchId: data.branch.id,
          orderId: data.order.id,
          sellerNameSnapshot: 'RC-003 seller',
          paymentMethod: 'cash',
          status: SaleStatus.paid,
          subtotalCents: RESERVED_STOCK * 200,
          totalCents: RESERVED_STOCK * 200,
        },
      });
      await expect(
        service(prismaA, data.tenant.id, data.branch.id).cancel(
          undefined,
          data.order.id,
          { cancellationReason: 'must fail' },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(
        await prismaA.product.findUniqueOrThrow({
          where: { id: data.product.id },
        }),
      ).toHaveProperty('quantity', INITIAL_STOCK - RESERVED_STOCK);
      expect(
        await prismaA.order.findUniqueOrThrow({ where: { id: data.order.id } }),
      ).toMatchObject({ status: OrderStatus.pending, stockRestoredAt: null });
    });

    it('hides cross-tenant and cross-branch orders', async () => {
      const data = await fixture();
      const other = await fixture();
      await expect(
        service(prismaA, other.tenant.id, data.branch.id).cancel(
          undefined,
          data.order.id,
          { cancellationReason: 'wrong tenant' },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service(prismaA, data.tenant.id, other.branch.id).cancel(
          undefined,
          data.order.id,
          { cancellationReason: 'wrong branch' },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(
        await prismaA.product.findUniqueOrThrow({
          where: { id: data.product.id },
        }),
      ).toHaveProperty('quantity', INITIAL_STOCK - RESERVED_STOCK);
    });

    it('rolls back the claim when a scoped stock restoration fails', async () => {
      const data = await fixture();
      const other = await fixture();
      await prismaA.orderItem.updateMany({
        where: { orderId: data.order.id },
        data: { productId: other.product.id },
      });

      await expect(
        service(prismaA, data.tenant.id, data.branch.id).cancel(
          undefined,
          data.order.id,
          { cancellationReason: 'forced rollback' },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(
        await prismaA.order.findUniqueOrThrow({ where: { id: data.order.id } }),
      ).toMatchObject({ status: OrderStatus.pending, stockRestoredAt: null });
      expect(
        await prismaA.product.findUniqueOrThrow({
          where: { id: other.product.id },
        }),
      ).toHaveProperty('quantity', INITIAL_STOCK - RESERVED_STOCK);
      expect(
        await prismaA.product.findUniqueOrThrow({
          where: { id: data.product.id },
        }),
      ).toHaveProperty('quantity', INITIAL_STOCK - RESERVED_STOCK);
      expect(
        await prismaA.securityAuditEvent.count({
          where: { eventType: 'order.admin_canceled', targetId: data.order.id },
        }),
      ).toBe(0);
    });
  },
);
