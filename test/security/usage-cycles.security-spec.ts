import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  assertSafeTestDatabaseUrl,
  hasSecurityTestDatabase,
} from '../helpers/test-database.guard';

const suite =
  hasSecurityTestDatabase() || process.env.CI === 'true'
    ? describe
    : describe.skip;
suite('usage cycle tenant constraints', () => {
  let prisma: PrismaClient;
  beforeAll(() => {
    prisma = new PrismaClient({
      datasourceUrl: assertSafeTestDatabaseUrl(
        process.env.SECURITY_TEST_DATABASE_URL,
      ),
    });
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });
  it('rejects a cycle attached to another tenant invoice', async () => {
    const suffix = randomUUID();
    let first: string | undefined;
    let second: string | undefined;
    let planId: string | undefined;
    try {
      const a = await prisma.tenant.create({
        data: { name: 'metering-a', slug: `meter-a-${suffix}` },
      });
      first = a.id;
      const b = await prisma.tenant.create({
        data: { name: 'metering-b', slug: `meter-b-${suffix}` },
      });
      second = b.id;
      const plan = await prisma.plan.create({
        data: { name: 'metering', slug: `meter-${suffix}`, priceCents: 100 },
      });
      planId = plan.id;
      const sub = await prisma.subscription.create({
        data: { tenantId: a.id, planId: plan.id },
      });
      const invoice = await prisma.billingInvoice.create({
        data: {
          tenantId: a.id,
          subscriptionId: sub.id,
          planId: plan.id,
          provider: 'MERCADO_PAGO',
          externalReference: `meter-${suffix}`,
          status: 'PAID',
          amountCents: 100,
          periodStartedAt: new Date('2026-09-01'),
          periodEndsAt: new Date('2026-10-01'),
        },
      });
      await expect(
        prisma.billingUsageCycle.create({
          data: {
            tenantId: b.id,
            invoiceId: invoice.id,
            periodStart: invoice.periodStartedAt,
            periodEnd: invoice.periodEndsAt!,
            status: 'UNAVAILABLE',
          },
        }),
      ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      await prisma.billingUsageCycle.create({
        data: {
          tenantId: a.id,
          invoiceId: invoice.id,
          periodStart: invoice.periodStartedAt,
          periodEnd: invoice.periodEndsAt!,
          status: 'ESTIMATED',
          costCents: 0,
        },
      });
      await expect(
        prisma.billingUsageCycle.count({ where: { tenantId: b.id } }),
      ).resolves.toBe(0);
    } finally {
      const tenants = [first, second].filter((id): id is string => Boolean(id));
      await prisma.billingUsageCycle.deleteMany({
        where: { tenantId: { in: tenants } },
      });
      await prisma.billingInvoice.deleteMany({
        where: { tenantId: { in: tenants } },
      });
      await prisma.subscription.deleteMany({
        where: { tenantId: { in: tenants } },
      });
      await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
      if (planId) await prisma.plan.delete({ where: { id: planId } });
    }
  });
});
