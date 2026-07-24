import { Controller, Post, Body, HttpException } from '@nestjs/common';
import {
  PrismaClient,
  PaymentProviderCode,
  PaymentMethod,
  PaymentRoutingContext,
  Role,
} from '@prisma/client';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { createServer } from 'http';
import { PaymentsController } from '../../src/payments/payments.controller';
import { PaymentsService } from '../../src/payments/payments.service';
import {
  PixPaymentProviderAdapter,
  ProviderCredentials,
  ProviderPayment,
} from '../../src/payments/ports/payment-provider.interface';
import {
  createBranch,
  createConnection,
  createOrder,
  createTenant,
} from './payment-idempotency-fixtures';
import {
  assertSafeTestDatabaseUrl,
  hasSecurityTestDatabase,
} from '../helpers/test-database.guard';

const runDatabaseSuite =
  hasSecurityTestDatabase() || process.env.CI === 'true'
    ? describe
    : describe.skip;

class FakePixAdapter implements PixPaymentProviderAdapter {
  readonly code = PaymentProviderCode.MERCADO_PAGO;
  calls: Array<{
    key: string;
    amountCents: number;
    externalReference: string;
  }> = [];
  networkCalls = 0;
  mode: 'success' | 'pre-network' | 'unknown' = 'success';
  blockExternal = true;
  private releaseProvider: (() => void) | undefined;
  private providerStarted = false;
  private released = false;
  private startedResolve!: () => void;
  private readonly started = new Promise<void>((resolve) => {
    this.startedResolve = resolve;
  });

  async createPixPayment(
    _credentials: ProviderCredentials,
    input: {
      amountCents: number;
      externalReference: string;
      description: string;
    },
    idempotencyKey: string,
  ): Promise<ProviderPayment> {
    this.calls.push({
      key: idempotencyKey,
      amountCents: input.amountCents,
      externalReference: input.externalReference,
    });
    if (this.mode === 'pre-network')
      throw new Error('provider rejected before request');
    this.networkCalls += 1;
    this.providerStarted = true;
    this.startedResolve();
    if (this.blockExternal && !this.released)
      await new Promise<void>((resolve) => {
        this.releaseProvider = resolve;
      });
    if (this.mode === 'unknown')
      throw new Error('network timeout after provider started');
    return {
      id: `fake-payment-${randomUUID()}`,
      status: 'approved',
      qrCode: 'fake-qr',
    };
  }

  waitUntilStarted(timeoutMs = 15_000) {
    if (this.providerStarted) return Promise.resolve();
    let timeout: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<void>((_, reject) => {
      timeout = setTimeout(
        () =>
          reject(
            new Error(
              'fake adapter did not start within the concurrency timeout',
            ),
          ),
        timeoutMs,
      );
    });
    return Promise.race([this.started, timeoutPromise]).finally(() =>
      clearTimeout(timeout),
    );
  }

  release() {
    this.released = true;
    this.releaseProvider?.();
  }
}

function barrier(size: number) {
  let entered = 0;
  let open!: () => void;
  const ready = new Promise<void>((resolve) => {
    open = resolve;
  });
  return async <T>(work: () => Promise<T>) => {
    entered += 1;
    if (entered === size) open();
    await ready;
    return work();
  };
}

@Controller()
class HttpHarness {
  static controller: PaymentsController;
  static branchId: string;

  @Post('payments/pix')
  async pix(@Body() body: any) {
    return HttpHarness.controller.pix(
      { user: undefined } as any,
      body,
      HttpHarness.branchId,
    );
  }
}

function createService(
  prisma: PrismaClient,
  tenantId: string,
  branchId: string,
  adapter: FakePixAdapter,
) {
  const contexts = {
    resolve: jest.fn(() => ({
      tenantId,
      branchId,
      userId: undefined,
      role: Role.Admin,
    })),
  };
  const registry = {
    require: jest.fn(() => adapter),
    get: jest.fn(() => adapter),
  };
  const crypto = {
    decrypt: jest.fn(() => ({ accessToken: 'safe-test-credential' })),
  };
  const audit = { record: jest.fn(() => undefined) };
  return new PaymentsService(
    prisma as any,
    contexts as any,
    registry as any,
    crypto as any,
    audit as any,
  );
}

runDatabaseSuite('RC-001 PIX idempotency on PostgreSQL', () => {
  let prismaA: PrismaClient;
  let prismaB: PrismaClient;
  const databaseUrl = hasSecurityTestDatabase()
    ? assertSafeTestDatabaseUrl(process.env.SECURITY_TEST_DATABASE_URL)
    : undefined;

  beforeAll(async () => {
    if (!databaseUrl)
      throw new Error(
        'SECURITY_TEST_DATABASE_URL is required for RC-001 concurrency tests.',
      );
    const pooledUrl = new URL(databaseUrl);
    pooledUrl.searchParams.set('connection_limit', '5');
    prismaA = new PrismaClient({ datasourceUrl: pooledUrl.toString() });
    prismaB = new PrismaClient({ datasourceUrl: pooledUrl.toString() });
    await prismaA.$connect();
    await prismaB.$connect();
  });

  afterAll(async () => {
    await prismaA?.$disconnect();
    await prismaB?.$disconnect();
  });

  async function fixture() {
    const tenant = await createTenant(prismaA);
    const branch = await createBranch(prismaA, tenant);
    const order = await createOrder(prismaA, { tenant, branch });
    const connection = await createConnection(prismaA, tenant);
    await prismaA.paymentRoutingPreference.create({
      data: {
        tenantId: tenant.id,
        connectionId: connection.id,
        method: PaymentMethod.PIX,
        context: PaymentRoutingContext.CHECKOUT,
      },
    });
    return { tenant, branch, order };
  }

  async function cleanup(tenantId: string) {
    await prismaA.paymentIdempotencyExecution.deleteMany({
      where: { tenantId },
    });
    await prismaA.paymentTransaction.deleteMany({ where: { tenantId } });
    await prismaA.paymentRoutingPreference.deleteMany({ where: { tenantId } });
    await prismaA.paymentConnection.deleteMany({ where: { tenantId } });
    await prismaA.order.deleteMany({ where: { tenantId } });
    await prismaA.branch.deleteMany({ where: { tenantId } });
    await prismaA.tenant.delete({ where: { id: tenantId } });
  }

  async function concurrent(
    size: number,
    mode: FakePixAdapter['mode'] = 'success',
  ) {
    const { tenant, branch, order } = await fixture();
    const adapter = new FakePixAdapter();
    adapter.mode = mode;
    const serviceA = createService(prismaA, tenant.id, branch.id, adapter);
    const serviceB = createService(prismaB, tenant.id, branch.id, adapter);
    const dto = {
      orderId: order.id,
      amountCents: 100,
      idempotencyKey: `rc001-${randomUUID()}`,
      description: 'RC-001',
    };
    const releaseAll = barrier(size);
    const calls = Array.from({ length: size }, (_, index) =>
      releaseAll(() =>
        (index % 2 === 0 ? serviceA : serviceB).createPix(
          undefined,
          dto,
          branch.id,
        ),
      ),
    );
    let startError: unknown;
    try {
      await adapter.waitUntilStarted();
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      startError = error;
    } finally {
      adapter.release();
    }
    const settled = await Promise.allSettled(calls);
    if (startError) {
      throw startError instanceof Error
        ? startError
        : new Error(String(startError));
    }
    const results = settled.map((result) => {
      if (result.status === 'rejected') {
        throw result.reason instanceof Error
          ? result.reason
          : new Error(String(result.reason));
      }
      return result.value;
    });
    const executions = await prismaA.paymentIdempotencyExecution.findMany({
      where: { tenantId: tenant.id },
    });
    return { tenant, branch, order, adapter, dto, results, executions };
  }

  it.each([2, 20, 100])(
    'disputa real com %i chamadas usa exatamente uma chamada externa',
    async (size) => {
      const result = await concurrent(size);
      try {
        expect(result.adapter.calls).toHaveLength(1);
        expect(result.adapter.networkCalls).toBe(1);
        expect(result.executions).toHaveLength(1);
        expect(result.executions[0].state).toBe('SUCCEEDED');
        expect(result.results).toHaveLength(size);
        expect(
          result.results.every((value: any) => value?.id || value?.recoverable),
        ).toBe(true);
      } finally {
        await cleanup(result.tenant.id);
      }
    },
    30_000,
  );

  it('usa duas instâncias independentes e rejeita payload divergente com HTTP 409', async () => {
    const { tenant, branch, order } = await fixture();
    const adapter = new FakePixAdapter();
    adapter.blockExternal = false;
    const service = createService(prismaA, tenant.id, branch.id, adapter);
    adapter.release();
    HttpHarness.controller = new PaymentsController(service);
    HttpHarness.branchId = branch.id;
    const server = createServer((req, res) => {
      let raw = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        void (async () => {
          try {
            const result = await HttpHarness.controller.pix(
              { user: undefined } as any,
              JSON.parse(raw),
              HttpHarness.branchId,
            );
            res.statusCode = 201;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify(result));
          } catch (error) {
            const status =
              error instanceof HttpException ? error.getStatus() : 500;
            const response =
              error instanceof HttpException
                ? error.getResponse()
                : { message: 'Internal Server Error' };
            res.statusCode = status;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify(response));
          }
        })();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    try {
      const key = `rc001-http-${randomUUID()}`;
      const first = {
        orderId: order.id,
        amountCents: 100,
        idempotencyKey: key,
        description: 'one',
      };
      await request(server).post('/payments/pix').send(first).expect(201);
      await request(server)
        .post('/payments/pix')
        .send({ ...first, description: 'two' })
        .expect(409);
      expect(adapter.calls).toHaveLength(1);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await cleanup(tenant.id);
    }
  }, 30_000);

  it('UNKNOWN não repete cobrança e falha pré-rede permite retry', async () => {
    const unknown = await concurrent(2, 'unknown');
    try {
      expect(unknown.adapter.calls).toHaveLength(1);
      expect(unknown.adapter.networkCalls).toBe(1);
      expect(unknown.executions).toHaveLength(1);
      expect(unknown.executions[0].state).toBe('UNKNOWN');

      const retryService = createService(
        prismaA,
        unknown.tenant.id,
        unknown.branch.id,
        unknown.adapter,
      );
      await expect(
        retryService.createPix(undefined, unknown.dto, unknown.branch.id),
      ).resolves.toMatchObject({ recoverable: true });
      expect(unknown.adapter.calls).toHaveLength(1);
      expect(unknown.adapter.networkCalls).toBe(1);
      expect(
        await prismaA.paymentIdempotencyExecution.count({
          where: { tenantId: unknown.tenant.id },
        }),
      ).toBe(1);
      expect(
        (
          await prismaA.paymentIdempotencyExecution.findFirst({
            where: { tenantId: unknown.tenant.id },
          })
        )?.state,
      ).toBe('UNKNOWN');
    } finally {
      await cleanup(unknown.tenant.id);
    }

    const { tenant, branch, order } = await fixture();
    const adapter = new FakePixAdapter();
    adapter.mode = 'pre-network';
    const service = createService(prismaA, tenant.id, branch.id, adapter);
    const dto = {
      orderId: order.id,
      amountCents: 100,
      idempotencyKey: `rc001-retry-${randomUUID()}`,
      description: 'retry',
    };
    await expect(
      service.createPix(undefined, dto, branch.id),
    ).rejects.toBeDefined();
    adapter.mode = 'success';
    const retried = service.createPix(undefined, dto, branch.id);
    await adapter.waitUntilStarted();
    adapter.release();
    await expect(retried).resolves.toHaveProperty('id');
    expect(adapter.networkCalls).toBe(1);
    await cleanup(tenant.id);
  });

  it('mantém claims isolados para tenants diferentes e rejeita connection/order cross-tenant', async () => {
    const left = await fixture();
    const right = await fixture();
    const adapter = new FakePixAdapter();
    const serviceLeft = createService(
      prismaA,
      left.tenant.id,
      left.branch.id,
      adapter,
    );
    const serviceRight = createService(
      prismaB,
      right.tenant.id,
      right.branch.id,
      adapter,
    );
    const key = `rc001-shared-${randomUUID()}`;
    adapter.release();
    const [a, b] = await Promise.all([
      serviceLeft.createPix(
        undefined,
        { orderId: left.order.id, amountCents: 100, idempotencyKey: key },
        left.branch.id,
      ),
      serviceRight.createPix(
        undefined,
        { orderId: right.order.id, amountCents: 100, idempotencyKey: key },
        right.branch.id,
      ),
    ]);
    expect(a).toHaveProperty('id');
    expect(b).toHaveProperty('id');
    expect(
      await prismaA.paymentIdempotencyExecution.count({
        where: { tenantId: left.tenant.id },
      }),
    ).toBe(1);
    expect(
      await prismaA.paymentIdempotencyExecution.count({
        where: { tenantId: right.tenant.id },
      }),
    ).toBe(1);
    await expect(
      serviceLeft.createPix(
        undefined,
        {
          orderId: right.order.id,
          amountCents: 100,
          idempotencyKey: `cross-${randomUUID()}`,
        },
        left.branch.id,
      ),
    ).rejects.toBeDefined();
    await cleanup(left.tenant.id);
    await cleanup(right.tenant.id);
  });
});
