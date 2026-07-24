import { PrismaClient, Role, SystemMode, SystemType } from '@prisma/client';
import * as request from 'supertest';
import {
  createBillingPayment,
  createBranch,
  createCheckout,
  createExpense,
  createMembership,
  createOrder,
  createProduct,
  createProfile,
  createSale,
  createTenant,
} from '../factories/security.factory';
import { createSecurityHttpApp } from '../helpers/security-http-app';
import {
  assertSafeTestDatabaseUrl,
  hasSecurityTestDatabase,
} from '../helpers/test-database.guard';

const describeDatabase = hasSecurityTestDatabase() ? describe : describe.skip;

describeDatabase('HTTP multi-tenant IDOR/BOLA critical paths', () => {
  const prisma = hasSecurityTestDatabase()
    ? new PrismaClient({
        datasourceUrl: assertSafeTestDatabaseUrl(
          process.env.SECURITY_TEST_DATABASE_URL,
        ),
      })
    : null;
  let app: any;
  let registerUser: any;
  let tenantA: any;
  let tenantB: any;
  let branchA: any;
  let branchB: any;
  let adminA: any;
  let sellerA: any;
  let buyerA: any;
  const devId = '00000000-0000-4000-8000-000000000999';

  beforeAll(async () => {
    if (!prisma) return;
    const securityApp = await createSecurityHttpApp();
    app = securityApp.app;
    registerUser = (input: any) => securityApp.registerUser(input);
    tenantA = await createTenant(prisma);
    tenantB = await createTenant(prisma);
    branchA = await createBranch(prisma, tenantA);
    branchB = await createBranch(prisma, tenantB);
    adminA = await createProfile(prisma, {
      role: Role.Admin,
      tenantId: tenantA.id,
    });
    sellerA = await createProfile(prisma, {
      role: Role.Vendedor,
      tenantId: tenantA.id,
    });
    buyerA = await createProfile(prisma, {
      role: Role.Comprador,
      tenantId: tenantA.id,
    });
    await createProfile(prisma, {
      id: devId,
      email: 'dev-security@test.local',
      role: Role.superAdmin,
    });
    await createMembership(prisma, adminA, tenantA, branchA, Role.Admin);
    await createMembership(prisma, sellerA, tenantA, branchA, Role.Vendedor);
    await createMembership(prisma, buyerA, tenantA, branchA, Role.Comprador);
    for (const [profile, role] of [
      [adminA, Role.Admin],
      [sellerA, Role.Vendedor],
      [buyerA, Role.Comprador],
    ] as const) {
      registerUser({
        id: profile.id,
        email: profile.email,
        role,
        tenantId: tenantA.id,
        branchId: branchA.id,
        systemType: SystemType.padrao,
        mode: SystemMode.padrao,
      });
    }
    process.env.DEV_SUPER_ADMIN_USER_IDS = devId;
    registerUser({
      id: devId,
      email: 'dev-security@test.local',
      role: Role.superAdmin,
      tenantId: null,
      branchId: null,
      isDevSuperAdmin: true,
    });
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  const auth = (profile: any, branchId = branchA.id) => ({
    'x-test-user-id': profile.id,
    'x-nextstock-branch-id': branchId,
    origin: 'http://security.test',
  });

  it('authenticates only registered identities without accepting context headers', async () => {
    expect((await request(app.getHttpServer()).get('/api/users')).status).toBe(
      401,
    );
    expect(
      (
        await request(app.getHttpServer())
          .get('/api/users')
          .set('x-test-user-id', '00000000-0000-4000-8000-000000000000')
      ).status,
    ).toBe(401);
    const known = await request(app.getHttpServer())
      .get('/api/users')
      .set(auth(adminA))
      .set('x-role', Role.superAdmin)
      .set('x-system-mode', SystemMode.visualizacao)
      .set('x-system-type', SystemType.petshop);
    expect(known.status).toBe(200);
    expect(JSON.stringify(known.body)).not.toContain(tenantB.id);
  });

  it('isolates products and rejects a foreign branch header', async () => {
    const own = await createProduct(prisma!, {
      tenant: tenantA,
      branch: branchA,
    });
    const foreign = await createProduct(prisma!, {
      tenant: tenantB,
      branch: branchB,
    });
    const list = await request(app.getHttpServer())
      .get('/api/products')
      .set(auth(adminA));
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).toContain(own.id);
    expect(JSON.stringify(list.body)).not.toContain(foreign.id);
    expect(
      (
        await request(app.getHttpServer())
          .get(`/api/products/${foreign.id}`)
          .set(auth(adminA))
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app.getHttpServer())
          .delete(`/api/products/${foreign.id}`)
          .set(auth(adminA))
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app.getHttpServer())
          .post(`/api/products/${foreign.id}/images/upload`)
          .set(auth(adminA))
          .attach('file', Buffer.from('not-reached'), {
            filename: 'test.jpg',
            contentType: 'image/jpeg',
          })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app.getHttpServer())
          .patch(`/api/products/${foreign.id}`)
          .set(auth(adminA))
          .set('content-type', 'application/json')
          .send({ nome: 'blocked' })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app.getHttpServer())
          .get('/api/products')
          .set(auth(adminA, branchB.id))
      ).status,
    ).toBe(403);
  });

  it('blocks foreign orders and external products', async () => {
    const foreignProduct = await createProduct(prisma!, {
      tenant: tenantB,
      branch: branchB,
    });
    const foreignOrder = await createOrder(prisma!, {
      tenant: tenantB,
      branch: branchB,
    });
    for (const path of [
      `/api/orders/${foreignOrder.id}`,
      `/api/orders/${foreignOrder.id}/receipt`,
    ]) {
      expect(
        (await request(app.getHttpServer()).get(path).set(auth(adminA))).status,
      ).toBe(404);
    }
    for (const operation of [
      request(app.getHttpServer())
        .patch(`/api/orders/${foreignOrder.id}`)
        .send({ notes: 'blocked' }),
      request(app.getHttpServer())
        .patch(`/api/orders/${foreignOrder.id}/cancel`)
        .send({ cancellationReason: 'blocked cross tenant' }),
      request(app.getHttpServer()).delete(`/api/orders/${foreignOrder.id}`),
    ]) {
      expect((await operation.set(auth(adminA))).status).toBe(404);
    }
    const create = await request(app.getHttpServer())
      .post('/api/orders')
      .set(auth(adminA))
      .send({
        customerName: 'Security',
        paymentMethod: 'pix',
        items: [{ productId: foreignProduct.id, quantity: 1 }],
      });
    expect([400, 404]).toContain(create.status);
  });

  it('blocks foreign sales and buyer cancellation', async () => {
    const foreignSale = await createSale(prisma!, {
      tenant: tenantB,
      branch: branchB,
    });
    expect(
      (
        await request(app.getHttpServer())
          .get(`/api/sales/${foreignSale.id}`)
          .set(auth(adminA))
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app.getHttpServer())
          .get(`/api/sales/${foreignSale.id}/receipt`)
          .set(auth(adminA))
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app.getHttpServer())
          .patch(`/api/sales/${foreignSale.id}/cancel`)
          .set(auth(adminA))
          .send({ cancellationReason: 'blocked cross tenant' })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app.getHttpServer())
          .patch(`/api/sales/${foreignSale.id}/cancel`)
          .set(auth(buyerA))
          .send({ reason: 'blocked' })
      ).status,
    ).toBe(403);
  });

  it('enforces role management boundaries', async () => {
    const foreignAdmin = await createProfile(prisma!, {
      role: Role.Admin,
      tenantId: tenantB.id,
    });
    await createMembership(prisma!, foreignAdmin, tenantB, branchB, Role.Admin);
    const list = await request(app.getHttpServer())
      .get('/api/users')
      .set(auth(adminA));
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain(foreignAdmin.id);
    expect(
      (
        await request(app.getHttpServer())
          .patch(`/api/users/${buyerA.id}/role`)
          .set(auth(sellerA))
          .send({ role: Role.Admin })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app.getHttpServer())
          .patch(`/api/users/${adminA.id}/role`)
          .set(auth(adminA))
          .send({ role: Role.Vendedor })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app.getHttpServer())
          .patch(`/api/users/${buyerA.id}/role`)
          .set(auth(adminA))
          .send({ role: Role.superAdmin })
      ).status,
    ).toBe(400);
  });

  it('blocks foreign expenses and checkout status', async () => {
    const foreignExpense = await createExpense(prisma!, {
      tenant: tenantB,
      branch: branchB,
    });
    const foreignFile = await prisma!.expenseFile.create({
      data: {
        expenseId: foreignExpense.id,
        tenantId: tenantB.id,
        branchId: branchB.id,
        fileName: 'private.pdf',
        mimeType: 'application/pdf',
        fileType: 'pdf',
        fileSize: 10,
        storagePath: `${tenantB.id}/${branchB.id}/private.pdf`,
      },
    });
    expect(
      (
        await request(app.getHttpServer())
          .get(`/api/expenses/${foreignExpense.id}`)
          .set(auth(adminA))
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app.getHttpServer())
          .get(
            `/api/expenses/${foreignExpense.id}/files/${foreignFile.id}/download`,
          )
          .set(auth(adminA))
      ).status,
    ).toBe(404);
    const plan = await prisma!.plan.create({
      data: {
        name: `Security ${Date.now()}`,
        slug: `security-${Date.now()}`,
        priceCents: 1000,
        currency: 'BRL',
      },
    });
    const checkout = await createCheckout(prisma!, {
      tenant: tenantB,
      plan,
    });
    await createBillingPayment(prisma!, { tenant: tenantB, plan });
    expect(
      (
        await request(app.getHttpServer())
          .get(`/api/billing/checkout/${checkout.id}/status`)
          .set(auth(adminA))
      ).status,
    ).toBe(404);
  });

  it('restricts partners to Dev and audits explicit real-tenant support', async () => {
    expect(
      (
        await request(app.getHttpServer())
          .get('/api/partners')
          .set(auth(adminA))
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app.getHttpServer())
          .get('/api/partners')
          .set('x-test-user-id', devId)
      ).status,
    ).toBe(200);
    const support = await request(app.getHttpServer())
      .get('/api/products/lookup')
      .query({ search: 'Security' })
      .set('x-test-user-id', devId)
      .set('x-nextstock-branch-id', branchB.id)
      .set('x-nextstock-dev-context', 'support');
    expect(support.status).toBe(200);
    await expect(
      prisma!.securityAuditEvent.findFirst({
        where: {
          eventType: 'dev_support.tenant_access',
          actorProfileId: devId,
          tenantId: tenantB.id,
          branchId: branchB.id,
          action: 'access_real_tenant',
        },
      }),
    ).resolves.toMatchObject({
      eventType: 'dev_support.tenant_access',
      actorProfileId: devId,
      tenantId: tenantB.id,
      branchId: branchB.id,
      action: 'access_real_tenant',
    });
  });
});
