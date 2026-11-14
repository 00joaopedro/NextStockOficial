import { PrismaClient, Role } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ProductsService } from '../../src/products/products.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { TenantContextService } from '../../src/tenancy/tenant-context.service';
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

  it('imports over 2,000 products once, including rows without barcodes', async () => {
    if (!prisma) throw new Error('security test database was not initialized');
    const tenant = await createTenant(prisma);
    const branch = await createBranch(prisma, tenant);
    const admin = await createProfile(prisma, {
      role: Role.Admin,
      tenantId: tenant.id,
    });
    const context = {
      resolve: jest
        .fn()
        .mockResolvedValue({ tenantId: tenant.id, branchId: branch.id }),
    };
    const service = new ProductsService(
      prisma as unknown as PrismaService,
      undefined,
      context as unknown as TenantContextService,
    );
    const user = { id: admin.id, role: Role.Admin } as Parameters<
      ProductsService['importBatch']
    >[0];
    const items = Array.from({ length: 2101 }, (_, index) => ({
      name: `Import ${index}`,
      barcode: index % 2 ? `000${index}` : null,
      costPriceCents: 1000,
      salePriceCents: 1500,
      quantity: 0,
    }));
    const key = randomUUID();
    try {
      for (let start = 0; start < items.length; start += 200) {
        const batch = items.slice(start, start + 200);
        await expect(
          service.importBatch(
            user,
            { items: batch },
            `${key}:${start}`,
            branch.id,
          ),
        ).resolves.toMatchObject({
          result: { imported: batch.length },
          replayed: false,
        });
      }
      await expect(
        service.importBatch(
          user,
          { items: items.slice(0, 200) },
          `${key}:0`,
          branch.id,
        ),
      ).resolves.toMatchObject({ result: { imported: 200 }, replayed: true });
      const scope = { tenantId: tenant.id, branchId: branch.id };
      await expect(prisma.product.count({ where: scope })).resolves.toBe(
        items.length,
      );
      await expect(
        prisma.product.count({ where: { ...scope, barcode: null } }),
      ).resolves.toBe(1051);
    } finally {
      await prisma.administrativeOperationExecution.deleteMany({
        where: { tenantScope: `${tenant.id}:${branch.id}` },
      });
      await prisma.product.deleteMany({
        where: { tenantId: tenant.id, branchId: branch.id },
      });
    }
  });

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
