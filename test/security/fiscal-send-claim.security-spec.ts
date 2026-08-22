import {
  FiscalEnvironment,
  FiscalSendAttemptState,
  PrismaClient,
  Role,
  SaleDocumentStatus,
  SaleDocumentType,
  SaleStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { FiscalService } from '../../src/fiscal/fiscal.service';
import { FiscalSequenceService } from '../../src/fiscal/fiscal-sequence.service';
import {
  FiscalProviderDocument,
  FiscalProviderSendError,
} from '../../src/fiscal/fiscal-provider.interface';
import {
  assertSafeTestDatabaseUrl,
  hasSecurityTestDatabase,
} from '../helpers/test-database.guard';

const databaseSuite =
  hasSecurityTestDatabase() || process.env.CI === 'true'
    ? describe
    : describe.skip;

class FakeFiscalProvider {
  readonly name = 'mock';
  readonly isRealProvider = true;
  providerCallCount = 0;
  mode: 'success' | 'unknown' | 'pre-network' = 'success';
  private releaseProvider?: () => void;
  private startedResolve!: () => void;
  private started = new Promise<void>(
    (resolve) => (this.startedResolve = resolve),
  );

  async sendNfe55(document: FiscalProviderDocument) {
    if (this.mode === 'pre-network') {
      throw new FiscalProviderSendError('certificate unavailable', 'NOT_SENT');
    }
    this.providerCallCount += 1;
    this.startedResolve();
    await new Promise<void>((resolve) => (this.releaseProvider = resolve));
    if (this.mode === 'unknown') throw new Error('timeout after dispatch');
    return {
      status: SaleDocumentStatus.authorized,
      providerRef: `provider-${document.number}`,
      accessKey: `key-${document.number}`,
      protocol: `protocol-${document.number}`,
      response: { accepted: true },
    };
  }
  waitUntilStarted() {
    let timeout: ReturnType<typeof setTimeout>;
    return Promise.race([
      this.started,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('provider start timeout')),
          10_000,
        );
      }),
    ]).finally(() => clearTimeout(timeout));
  }
  release() {
    this.releaseProvider?.();
  }
  buildXml = () => Promise.resolve(null);
  sendNfce65 = this.sendNfe55.bind(this);
  queryStatus = this.sendNfe55.bind(this);
  cancel = () => Promise.resolve({ status: SaleDocumentStatus.canceled });
  generateDanfe = () => Promise.resolve(null);
}

function barrier(size: number) {
  let count = 0;
  let open!: () => void;
  const ready = new Promise<void>((resolve) => (open = resolve));
  return async <T>(work: () => Promise<T>) => {
    if (++count === size) open();
    await ready;
    return work();
  };
}

function service(
  prisma: PrismaClient,
  tenantId: string,
  branchId: string,
  provider: FakeFiscalProvider,
) {
  return new FiscalService(
    prisma as any,
    {
      resolve: jest.fn(() => ({
        tenantId,
        branchId,
        userId: undefined,
        role: Role.Admin,
      })),
    } as any,
    {
      assertSaleEligible: jest.fn(),
      assertConfig: jest.fn(),
      assertItems: jest.fn(),
      sanitizeProviderPayload: jest.fn((value) => value || {}),
    } as any,
    new FiscalSequenceService(prisma as any),
    { uploadXml: jest.fn(), uploadPdf: jest.fn() } as any,
    provider as any,
  );
}

databaseSuite('RC-002 fiscal send claim on PostgreSQL 16', () => {
  let prismaA: PrismaClient;
  let prismaB: PrismaClient;
  const url = hasSecurityTestDatabase()
    ? assertSafeTestDatabaseUrl(process.env.SECURITY_TEST_DATABASE_URL)
    : undefined;

  beforeAll(async () => {
    if (!url)
      throw new Error('SECURITY_TEST_DATABASE_URL is required for RC-002.');
    prismaA = new PrismaClient({ datasourceUrl: url });
    prismaB = new PrismaClient({ datasourceUrl: url });
    await Promise.all([prismaA.$connect(), prismaB.$connect()]);
  });
  afterAll(async () =>
    Promise.all([prismaA?.$disconnect(), prismaB?.$disconnect()]),
  );

  async function fixture() {
    const tenant = await prismaA.tenant.create({
      data: { name: 'RC-002', slug: `rc002-${randomUUID()}` },
    });
    const branch = await prismaA.branch.create({
      data: {
        tenantId: tenant.id,
        name: 'RC-002',
        slug: `rc002-${randomUUID()}`,
      },
    });
    const sale = await prismaA.sale.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        sellerNameSnapshot: 'RC-002',
        paymentMethod: 'cash',
        status: SaleStatus.paid,
        subtotalCents: 100,
        totalCents: 100,
      },
    });
    await prismaA.companyFiscalConfig.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        legalName: 'RC-002 Ltda',
        cnpj: '12345678000199',
        crt: 1,
        taxRegime: 'simples',
        street: 'Rua A',
        number: '1',
        district: 'Centro',
        city: 'Sao Paulo',
        cityCodeIbge: '3550308',
        state: 'SP',
        zipCode: '01001000',
        environment: FiscalEnvironment.homologacao,
        provider: 'mock',
        nfeSeries: '1',
        nfceSeries: '1',
      },
    });
    const document = await prismaA.saleDocument.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        saleId: sale.id,
        type: SaleDocumentType.nfe55,
        model: '55',
        series: '1',
        environment: FiscalEnvironment.homologacao,
        normalizedPayload: {},
      },
    });
    return { tenant, branch, document };
  }
  async function cleanup(tenantId: string) {
    await prismaA.tenant.delete({ where: { id: tenantId } });
  }

  async function compete(size: number) {
    const data = await fixture();
    const provider = new FakeFiscalProvider();
    const a = service(prismaA, data.tenant.id, data.branch.id, provider);
    const b = service(prismaB, data.tenant.id, data.branch.id, provider);
    const gate = barrier(size);
    const calls = Array.from({ length: size }, (_, i) =>
      gate(() =>
        (i % 2 ? a : b).sendDocument(
          undefined,
          data.document.id,
          {},
          data.branch.id,
        ),
      ),
    );
    await provider.waitUntilStarted();
    await new Promise((resolve) => setTimeout(resolve, 100));
    provider.release();
    const results = await Promise.all(calls);
    const document = await prismaA.saleDocument.findUniqueOrThrow({
      where: { id: data.document.id },
    });
    const sequence = await prismaA.fiscalSequence.findMany({
      where: { tenantId: data.tenant.id },
    });
    return { ...data, provider, results, current: document, sequence };
  }

  it.each([2, 20, 100])(
    'com %i chamadas concorrentes faz providerCallCount === 1',
    async (size) => {
      const result = await compete(size);
      try {
        expect(result.provider.providerCallCount).toBe(1);
        expect(result.sequence).toHaveLength(1);
        expect(result.sequence[0].nextNumber).toBe(2);
        expect(result.current.number).toBe('1');
        expect(result.current.series).toBe('1');
        expect(result.current.sendAttemptId).toBeTruthy();
        expect(result.current.sendAttemptState).toBe(
          FiscalSendAttemptState.completed,
        );
      } finally {
        await cleanup(result.tenant.id);
      }
    },
    30_000,
  );

  it('retorna autorizado idempotentemente e ignora resposta antiga', async () => {
    const data = await fixture();
    const provider = new FakeFiscalProvider();
    const svc = service(prismaA, data.tenant.id, data.branch.id, provider);
    const pending = svc.sendDocument(
      undefined,
      data.document.id,
      {},
      data.branch.id,
    );
    await provider.waitUntilStarted();
    const owner = await prismaA.saleDocument.findUniqueOrThrow({
      where: { id: data.document.id },
    });
    const replacement = randomUUID();
    await prismaA.saleDocument.update({
      where: { id: data.document.id },
      data: {
        sendAttemptId: replacement,
        sendAttemptState: FiscalSendAttemptState.dispatching,
        providerRef: 'new-owner',
      },
    });
    provider.release();
    await expect(pending).resolves.toMatchObject({
      staleResponseIgnored: true,
    });
    const current = await prismaA.saleDocument.findUniqueOrThrow({
      where: { id: data.document.id },
    });
    expect(current.sendAttemptId).toBe(replacement);
    expect(current.providerRef).toBe('new-owner');
    expect(current.sendAttemptId).not.toBe(owner.sendAttemptId);
    await prismaA.saleDocument.update({
      where: { id: data.document.id },
      data: { status: SaleDocumentStatus.authorized },
    });
    await svc.sendDocument(undefined, data.document.id, {}, data.branch.id);
    expect(provider.providerCallCount).toBe(1);
    await cleanup(data.tenant.id);
  });

  it('UNKNOWN bloqueia retry cego e falha pre-network permite retry com numero estavel', async () => {
    const data = await fixture();
    const unknownProvider = new FakeFiscalProvider();
    unknownProvider.mode = 'unknown';
    const svc = service(
      prismaA,
      data.tenant.id,
      data.branch.id,
      unknownProvider,
    );
    const pending = svc.sendDocument(
      undefined,
      data.document.id,
      {},
      data.branch.id,
    );
    await unknownProvider.waitUntilStarted();
    unknownProvider.release();
    await expect(pending).rejects.toBeDefined();
    await svc.sendDocument(undefined, data.document.id, {}, data.branch.id);
    expect(unknownProvider.providerCallCount).toBe(1);
    expect(
      (
        await prismaA.saleDocument.findUniqueOrThrow({
          where: { id: data.document.id },
        })
      ).sendAttemptState,
    ).toBe(FiscalSendAttemptState.unknown);
    await cleanup(data.tenant.id);

    const retry = await fixture();
    const retryProvider = new FakeFiscalProvider();
    retryProvider.mode = 'pre-network';
    const retrySvc = service(
      prismaA,
      retry.tenant.id,
      retry.branch.id,
      retryProvider,
    );
    await expect(
      retrySvc.sendDocument(undefined, retry.document.id, {}, retry.branch.id),
    ).rejects.toBeDefined();
    retryProvider.mode = 'success';
    const second = retrySvc.sendDocument(
      undefined,
      retry.document.id,
      {},
      retry.branch.id,
    );
    await retryProvider.waitUntilStarted();
    retryProvider.release();
    await second;
    expect(retryProvider.providerCallCount).toBe(1);
    expect(
      (
        await prismaA.saleDocument.findUniqueOrThrow({
          where: { id: retry.document.id },
        })
      ).number,
    ).toBe('1');
    await cleanup(retry.tenant.id);
  });

  it('isola tenant e filial no claim e na leitura', async () => {
    const left = await fixture();
    const right = await fixture();
    const provider = new FakeFiscalProvider();
    const wrong = service(prismaB, right.tenant.id, right.branch.id, provider);
    await expect(
      wrong.sendDocument(undefined, left.document.id, {}, right.branch.id),
    ).rejects.toBeDefined();
    expect(provider.providerCallCount).toBe(0);
    await cleanup(left.tenant.id);
    await cleanup(right.tenant.id);
  });
});
