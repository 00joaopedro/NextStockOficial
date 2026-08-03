import {
  OrderPaymentMethod,
  OrderSource,
  OrderStatus,
  PrismaClient,
  StorefrontStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  storefrontOrderLimitLockKey,
  STOREFRONT_ACTIVE_ORDER_LIMIT,
} from '../../src/storefront/storefront-order-limit';
import { createBranch, createTenant } from '../factories/security.factory';

const databaseUrl = process.env.SECURITY_TEST_DATABASE_URL;
describe('RC-015 PostgreSQL advisory lock across replicas', () => {
  const prismaA = new PrismaClient({ datasourceUrl: databaseUrl });
  const prismaB = new PrismaClient({ datasourceUrl: databaseUrl });

  afterAll(async () => {
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
    'serializes initial=%i requests=%i on two Prisma clients',
    async (initial, requests) => {
      const tenant = await createTenant(prismaA);
      const branch = await createBranch(prismaA, tenant);
      const storefront = await prismaA.storefront.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          publicSlug: `rc015-${randomUUID()}`,
          publicName: 'RC-015',
          status: StorefrontStatus.active,
          orderingEnabled: true,
        },
      });
      const phone = '11999990000';
      for (let index = 0; index < initial; index += 1)
        await prismaA.order.create({ data: orderData(index) });

      const lockKey = storefrontOrderLimitLockKey({
        tenantId: tenant.id,
        storefrontId: storefront.id,
        branchId: branch.id,
        phone,
      });
      const attempt = (client: PrismaClient, index: number) =>
        client.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
          const count = await tx.order.count({
            where: {
              tenantId: tenant.id,
              branchId: branch.id,
              storefrontId: storefront.id,
              customerPhone: phone,
              source: OrderSource.storefront_guest,
              status: {
                in: [
                  OrderStatus.pending,
                  OrderStatus.preparing,
                  OrderStatus.paid,
                ],
              },
              deletedAt: null,
              createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
            },
          });
          if (count >= STOREFRONT_ACTIVE_ORDER_LIMIT) return null;
          return tx.order.create({ data: orderData(initial + index) });
        });
      const results = await Promise.all(
        Array.from({ length: requests }, (_, index) =>
          attempt(index % 2 ? prismaB : prismaA, index),
        ),
      );
      const winners = results.filter(Boolean);
      const expectedWinners = Math.min(requests, 3 - initial);
      expect(new Set(winners.map((order) => order!.id)).size).toBe(
        expectedWinners,
      );
      expect(winners).toHaveLength(expectedWinners);
      expect(
        await prismaA.order.count({
          where: { storefrontId: storefront.id, customerPhone: phone },
        }),
      ).toBe(initial + expectedWinners);

      function orderData(index: number) {
        return {
          tenantId: tenant.id,
          branchId: branch.id,
          storefrontId: storefront.id,
          source: OrderSource.storefront_guest,
          publicReference: `RC015-${randomUUID()}-${index}`,
          customerName: 'RC-015 customer',
          customerPhone: phone,
          paymentMethod: OrderPaymentMethod.other,
          status: OrderStatus.pending,
          subtotalCents: 100,
          totalCents: 100,
        };
      }
    },
    30000,
  );
});
