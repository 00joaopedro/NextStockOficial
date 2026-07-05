import { PrismaClient, Role } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  createBranch,
  createMembership,
  createOrder,
  createProduct,
  createProfile,
  createSale,
  createTenant,
} from '../factories/security.factory';
import {
  assertSafeTestDatabaseUrl,
  hasSecurityTestDatabase,
} from '../helpers/test-database.guard';

const describeDatabase = hasSecurityTestDatabase() ? describe : describe.skip;

describeDatabase('multi-tenant database isolation', () => {
  const prisma = hasSecurityTestDatabase()
    ? new PrismaClient({
        datasourceUrl: assertSafeTestDatabaseUrl(
          process.env.SECURITY_TEST_DATABASE_URL,
        ),
      })
    : null;

  afterAll(async () => prisma?.$disconnect());

  it('scoped product/order/sale queries never return another branch', async () => {
    if (!prisma) throw new Error('security test database was not initialized');
    const tenantA = await createTenant(prisma);
    const tenantB = await createTenant(prisma);
    const branchA = await createBranch(prisma, tenantA);
    const branchB = await createBranch(prisma, tenantB);
    const adminA = await createProfile(prisma, {
      role: Role.Admin,
      tenantId: tenantA.id,
    });
    await createMembership(prisma, adminA, tenantA, branchA, Role.Admin);
    const productA = await createProduct(prisma, {
      tenant: tenantA,
      branch: branchA,
      sku: 'SHARED-SKU',
    });
    const productB = await createProduct(prisma, {
      tenant: tenantB,
      branch: branchB,
      sku: 'SHARED-SKU',
    });
    const orderB = await createOrder(prisma, {
      tenant: tenantB,
      branch: branchB,
    });
    const sharedIdempotencyKey = randomUUID();
    const saleA = await createSale(prisma, {
      tenant: tenantA,
      branch: branchA,
      idempotencyKey: sharedIdempotencyKey,
    });
    const saleB = await createSale(prisma, {
      tenant: tenantB,
      branch: branchB,
      idempotencyKey: sharedIdempotencyKey,
    });

    await expect(
      prisma.product.findFirst({
        where: { id: productB.id, tenantId: tenantA.id, branchId: branchA.id },
      }),
    ).resolves.toBeNull();
    await expect(
      prisma.order.findFirst({
        where: { id: orderB.id, tenantId: tenantA.id, branchId: branchA.id },
      }),
    ).resolves.toBeNull();
    await expect(
      prisma.sale.findFirst({
        where: { id: saleB.id, tenantId: tenantA.id, branchId: branchA.id },
      }),
    ).resolves.toBeNull();
    expect(productA.sku).toBe(productB.sku);
    expect(saleA.idempotencyKey).toBe(saleB.idempotencyKey);
  });
});
