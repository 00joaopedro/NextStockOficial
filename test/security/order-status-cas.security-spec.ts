import { ConflictException } from '@nestjs/common';
import {
  OrderPaymentMethod,
  OrderStatus,
  PrismaClient,
  Role,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { OrdersService } from '../../src/orders/orders.service';
import { SalesService } from '../../src/sales/sales.service';
import { assertSafeTestDatabaseUrl } from '../helpers/test-database.guard';
import {
  createBranch,
  createProfile,
  createTenant,
} from '../factories/security.factory';

describe('RC-007 order status CAS on PostgreSQL', () => {
  let a: PrismaClient;
  let b: PrismaClient;
  const tenants: string[] = [];
  const url = assertSafeTestDatabaseUrl(process.env.SECURITY_TEST_DATABASE_URL);

  beforeAll(async () => {
    a = new PrismaClient({ datasourceUrl: url });
    b = new PrismaClient({ datasourceUrl: url });
    await Promise.all([a.$connect(), b.$connect()]);
  });

  afterAll(async () => {
    for (const tenantId of tenants) {
      await a.securityAuditEvent.deleteMany({ where: { tenantId } });
      await a.sale.deleteMany({ where: { tenantId } });
      await a.order.deleteMany({ where: { tenantId } });
      await a.product.deleteMany({ where: { tenantId } });
      await a.userProfile.deleteMany({ where: { tenantId } });
      await a.branch.deleteMany({ where: { tenantId } });
      await a.tenant.delete({ where: { id: tenantId } });
    }
    await Promise.all([a.$disconnect(), b.$disconnect()]);
  });

  async function fixture() {
    const tenant = await createTenant(a, { name: `RC007-${randomUUID()}` });
    tenants.push(tenant.id);
    const branch = await createBranch(a, tenant);
    const profile = await createProfile(a, {
      tenantId: tenant.id,
      role: Role.Admin,
    });
    const product = await a.product.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        name: 'RC007 product',
        costPriceCents: 100,
        profitPercent: 100,
        salePriceCents: 200,
        quantity: 43,
      },
    });
    const order = await a.order.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        customerName: 'RC007 customer',
        paymentMethod: OrderPaymentMethod.cash,
        status: OrderStatus.pending,
        subtotalCents: 1400,
        totalCents: 1400,
        items: {
          create: {
            productId: product.id,
            productNameSnapshot: product.name,
            quantity: 7,
            unitPriceCents: 200,
            totalPriceCents: 1400,
          },
        },
      },
    });
    return { tenant, branch, profile, product, order };
  }

  function services(
    prisma: PrismaClient,
    f: Awaited<ReturnType<typeof fixture>>,
  ) {
    const context = {
      resolve: jest.fn().mockResolvedValue({
        tenantId: f.tenant.id,
        branchId: f.branch.id,
        userId: f.profile.id,
        role: Role.Admin,
        contextKind: 'normal',
        isDevSuperAdmin: false,
      }),
    } as any;
    const sales = new SalesService(
      prisma as any,
      context,
      {} as any,
      {} as any,
    );
    const orders = new OrdersService(prisma as any, context, sales);
    const user = { id: f.profile.id, role: Role.Admin, name: 'RC007' } as any;
    return { orders, sales, user };
  }

  async function state(f: Awaited<ReturnType<typeof fixture>>) {
    const [order, sales, product, events] = await Promise.all([
      a.order.findUniqueOrThrow({ where: { id: f.order.id } }),
      a.sale.findMany({ where: { orderId: f.order.id } }),
      a.product.findUniqueOrThrow({ where: { id: f.product.id } }),
      a.securityAuditEvent.findMany({ where: { targetId: f.order.id } }),
    ]);
    expect(sales.length).toBeLessThanOrEqual(1);
    expect(
      events.filter((event) => event.eventType === 'order.delivered').length,
    ).toBeLessThanOrEqual(1);
    expect(
      events.filter((event) => event.eventType === 'order.admin_canceled')
        .length,
    ).toBeLessThanOrEqual(1);
    if (order.status === OrderStatus.canceled) {
      expect(product.quantity).toBe(50);
      expect(sales).toHaveLength(0);
      expect(order.canceledAt).toBeInstanceOf(Date);
      expect(order.deliveredAt).toBeNull();
    } else {
      expect(product.quantity).toBe(43);
      expect(order.stockRestoredAt).toBeNull();
    }
    return { order, sales };
  }

  it.each([2, 20, 100])(
    'keeps %i mixed cancel/pay/deliver attempts coherent',
    async (size) => {
      const f = await fixture();
      const left = services(a, f);
      const right = services(b, f);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const calls = Array.from({ length: size }, async (_, index) => {
        await gate;
        const s = index % 2 ? left : right;
        if (index % 3 === 0)
          return s.orders.cancel(s.user, f.order.id, {
            cancellationReason: 'race',
          });
        if (index % 3 === 1) return s.orders.deliver(s.user, f.order.id);
        return s.sales.createFromOrder(s.user, f.order.id);
      });
      release();
      const results = await Promise.allSettled(calls);
      expect(
        results
          .filter((r) => r.status === 'rejected')
          .every(
            (r) =>
              r.status === 'rejected' && r.reason instanceof ConflictException,
          ),
      ).toBe(true);
      await state(f);
    },
    90_000,
  );
});
