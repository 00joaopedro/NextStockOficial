import { Body, Controller, Post, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import {
  PrismaClient,
  PaymentProviderCode,
  PaymentMethod,
  PaymentRoutingContext,
  Role,
} from '@prisma/client';
import request from 'supertest';
import { randomUUID } from 'crypto';
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
  private releaseProvider: (() => void) | undefined;
  private providerStarted = false;
  private released = false;

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
      throw new Error('provider rejected before network');
    this.networkCalls += 1;
    this.providerStarted = true;
    if (!this.released)
      await new Promise<void>((resolve) => {
        this.releaseProvider = resolve;
      });
    if (this.mode === 'unknown')
      throw new Error('network timeout after provider started');
    return {
      id: `fake-payment-${this.calls.length}`,
      status: 'approved',
      qrCode: 'fake-qr',
    };
  }

  waitUntilStarted() {
    return new Promise<void>((resolve) => {
      const poll = () =>
        this.providerStarted ? resolve() : setTimeout(poll, 5);
      poll();
    });
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
    prismaA = new PrismaClient({ datasourceUrl: databaseUrl });
    prismaB = new PrismaClient({ datasourceUrl: databaseUrl });
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
    await adapter.waitUntilStarted();
    await new Promise((resolve) => setTimeout(resolve, 100));
    adapter.release();
    const results = await Promise.all(calls);
    const executions = await prismaA.paymentIdempotencyExecution.findMany({
      where: { tenantId: tenant.id },
    });
    return { tenant, branch, order, adapter, results, executions };
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
    const service = createService(prismaA, tenant.id, branch.id, adapter);
    adapter.release();
    HttpHarness.controller = new PaymentsController(service);
    HttpHarness.branchId = branch.id;
    const module = await Test.createTestingModule({
      controllers: [HttpHarness],
    }).compile();
    const app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    try {
      const key = `rc001-http-${randomUUID()}`;
      const first = {
        orderId: order.id,
        amountCents: 100,
        idempotencyKey: key,
        description: 'one',
      };
      await request(app.getHttpServer())
        .post('/payments/pix')
        .send(first)
        .expect(201);
      await request(app.getHttpServer())
        .post('/payments/pix')
        .send({ ...first, description: 'two' })
        .expect(409);
      expect(adapter.calls).toHaveLength(1);
    } finally {
      await app.close();
      await cleanup(tenant.id);
    }
  });

  it('UNKNOWN não repete cobrança e falha pré-rede permite retry', async () => {
    const unknown = await concurrent(2, 'unknown');
    try {
      expect(unknown.adapter.calls).toHaveLength(1);
      expect(unknown.executions[0].state).toBe('UNKNOWN');
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
