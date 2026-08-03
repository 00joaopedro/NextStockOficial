import {
  PrismaClient,
  Role,
  SaleDocumentStatus,
  SaleDocumentType,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { InternalReceiptService } from '../../src/sales/internal-receipt.service';
import {
  assertSafeTestDatabaseUrl,
  hasSecurityTestDatabase,
} from '../helpers/test-database.guard';

const exactSequence = (size: number) =>
  Array.from({ length: size }, (_, index) => index + 1);

describe('RC-012 receipt print numbering', () => {
  let prismaA: PrismaClient;
  let prismaB: PrismaClient;
  const databaseUrl = hasSecurityTestDatabase()
    ? assertSafeTestDatabaseUrl(process.env.SECURITY_TEST_DATABASE_URL)
    : undefined;

  beforeAll(async () => {
    if (!databaseUrl)
      throw new Error('SECURITY_TEST_DATABASE_URL is required for RC-012.');
    const url = new URL(databaseUrl);
    url.searchParams.set('connection_limit', '30');
    prismaA = new PrismaClient({ datasourceUrl: url.toString() });
    prismaB = new PrismaClient({ datasourceUrl: url.toString() });
    await Promise.all([prismaA.$connect(), prismaB.$connect()]);
  });
  afterAll(async () =>
    Promise.all([prismaA?.$disconnect(), prismaB?.$disconnect()]),
  );

  async function fixture() {
    const tenant = await prismaA.tenant.create({
      data: { name: 'RC-012 tenant', slug: `rc012-${randomUUID()}` },
    });
    const branch = await prismaA.branch.create({
      data: {
        tenantId: tenant.id,
        name: 'RC-012 branch',
        slug: `rc012-${randomUUID()}`,
        isActive: true,
      },
    });
    const actor = await prismaA.userProfile.create({
      data: {
        id: randomUUID(),
        tenantId: tenant.id,
        email: `rc012-${randomUUID()}@example.invalid`,
        name: 'RC012',
        accessNameNormalized: `rc012-${randomUUID()}`,
        role: Role.Admin,
      },
    });
    const saleRow = await prismaA.sale.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        sellerId: actor.id,
        sellerNameSnapshot: actor.name,
        paymentMethod: 'pix',
        subtotalCents: 100,
        totalCents: 100,
        paidCents: 100,
      },
    });
    const sale = {
      id: saleRow.id,
      orderId: null,
      sellerNameSnapshot: actor.name,
      paymentMethod: 'pix',
      paymentMachineNameSnapshot: null,
      subtotalCents: 100,
      discountCents: 0,
      totalCents: 100,
      paidCents: 100,
      changeCents: 0,
      soldAt: saleRow.soldAt,
      items: [
        {
          productNameSnapshot: 'Item',
          quantity: 1,
          unitPriceCents: 100,
          totalPriceCents: 100,
        },
      ],
    };
    return { tenant, branch, actor, sale };
  }

  it.each([2, 20, 50, 100])(
    'allocates the exact 1..%i sequence across two clients and one concurrent document creation',
    async (size) => {
      const f = await fixture();
      const services = [
        new InternalReceiptService(prismaA as any),
        new InternalReceiptService(prismaB as any),
      ];
      const calls = exactSequence(size).map((_, index) =>
        services[index % 2].issueAndRender({
          sale: f.sale,
          context: {
            userId: f.actor.id,
            tenantId: f.tenant.id,
            branchId: f.branch.id,
          },
          origin: index % 2 ? 'history' : 'cash_register',
        }),
      );
      const settled = await Promise.allSettled(calls);
      expect(settled.every((result) => result.status === 'fulfilled')).toBe(
        true,
      );
      const fulfilled = settled.filter(
        (
          result,
        ): result is PromiseFulfilledResult<
          Awaited<ReturnType<InternalReceiptService['issueAndRender']>>
        > => result.status === 'fulfilled',
      );
      const numbers = fulfilled
        .map((result) => result.value.printNumber)
        .sort((a, b) => a - b);
      expect(numbers).toEqual(exactSequence(size));
      fulfilled.forEach((result) =>
        expect(result.value.html).toContain(
          `Via de impressão: ${result.value.printNumber}`,
        ),
      );

      const documents = await prismaA.saleDocument.findMany({
        where: {
          saleId: f.sale.id,
          type: SaleDocumentType.receipt,
          deletedAt: null,
        },
      });
      expect(documents).toHaveLength(1);
      expect(documents[0].printCounter).toBe(size);
      const events = await prismaA.fiscalDocumentEvent.findMany({
        where: { documentId: documents[0].id },
        orderBy: { printNumber: 'asc' },
      });
      expect(events).toHaveLength(size);
      expect(events.map((event) => event.printNumber)).toEqual(
        exactSequence(size),
      );
      expect(
        events.filter(
          (event) => event.eventType === 'internal_receipt_printed',
        ),
      ).toHaveLength(1);
      expect(
        events.filter(
          (event) => event.eventType === 'internal_receipt_reprinted',
        ),
      ).toHaveLength(size - 1);
    },
    60_000,
  );

  it('enforces unique print number and nonnegative counter in PostgreSQL', async () => {
    const f = await fixture();
    const document = await prismaA.saleDocument.create({
      data: {
        saleId: f.sale.id,
        tenantId: f.tenant.id,
        branchId: f.branch.id,
        type: SaleDocumentType.receipt,
        status: SaleDocumentStatus.internal_issued,
      },
    });
    await prismaA.fiscalDocumentEvent.create({
      data: {
        documentId: document.id,
        eventType: 'internal_receipt_printed',
        status: SaleDocumentStatus.internal_issued,
        printNumber: 1,
      },
    });
    await expect(
      prismaB.fiscalDocumentEvent.create({
        data: {
          documentId: document.id,
          eventType: 'internal_receipt_reprinted',
          status: SaleDocumentStatus.internal_issued,
          printNumber: 1,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prismaA.saleDocument.update({
        where: { id: document.id },
        data: { printCounter: -1 },
      }),
    ).rejects.toThrow();
  });

  it('does not recover a conflicting receipt from another tenant or branch', async () => {
    const own = await fixture();
    const foreign = await fixture();
    const service = new InternalReceiptService(prismaB as any);
    await expect(
      service.issueAndRender({
        sale: own.sale,
        context: {
          userId: foreign.actor.id,
          tenantId: foreign.tenant.id,
          branchId: foreign.branch.id,
        },
        origin: 'legacy',
      }),
    ).rejects.toThrow('scoped document');
    const document = await prismaA.saleDocument.findFirst({
      where: { saleId: own.sale.id },
    });
    expect(document).toBeNull();
  });
});
