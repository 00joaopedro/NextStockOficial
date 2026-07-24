import {
  PaymentMethod,
  PaymentProviderCode,
  PaymentRoutingContext,
  PrismaClient,
  Role,
  SystemMode,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PaymentsService } from '../../src/payments/payments.service';
import {
  assertSafeTestDatabaseUrl,
  hasSecurityTestDatabase,
} from '../helpers/test-database.guard';
import {
  createBranch,
  createMembership,
  createOrder,
  createProfile,
  createTenant,
} from '../factories/security.factory';

const describeDatabase = hasSecurityTestDatabase() ? describe : describe.skip;

describeDatabase('PIX idempotency with PostgreSQL concurrency', () => {
  const url = hasSecurityTestDatabase()
    ? assertSafeTestDatabaseUrl(process.env.SECURITY_TEST_DATABASE_URL)
    : '';
  const prismaA = hasSecurityTestDatabase()
    ? new PrismaClient({ datasourceUrl: url })
    : null;
  const prismaB = hasSecurityTestDatabase()
    ? new PrismaClient({ datasourceUrl: url })
    : null;

  afterAll(async () =>
    Promise.all([prismaA?.$disconnect(), prismaB?.$disconnect()]),
  );

  async function scenario(options?: {
    providerError?: Error;
    cryptoFailsOnce?: boolean;
  }) {
    if (!prismaA || !prismaB)
      throw new Error('security test database was not initialized');
    const tenant = await createTenant(prismaA, { mode: SystemMode.padrao });
    const branch = await createBranch(prismaA, tenant);
    const profile = await createProfile(prismaA, {
      role: Role.Admin,
      tenantId: tenant.id,
    });
    await createMembership(prismaA, profile, tenant, branch, Role.Admin);
    const order = await createOrder(prismaA, {
      tenant,
      branch,
    });
    const connection = await prismaA.paymentConnection.create({
      data: {
        tenantId: tenant.id,
        providerCode: PaymentProviderCode.MERCADO_PAGO,
        displayName: 'Fake PIX',
        status: 'ACTIVE',
        encryptedCredentials: 'fake-encrypted',
        lastValidatedAt: new Date(),
      },
    });
    await prismaA.paymentRoutingPreference.create({
      data: {
        tenantId: tenant.id,
        connectionId: connection.id,
        method: PaymentMethod.PIX,
        context: PaymentRoutingContext.CHECKOUT,
      },
    });
    let calls = 0;
    const provider = {
      createPixPayment: jest.fn(() => {
        calls += 1;
        if (options?.providerError)
          return Promise.reject(options.providerError);
        return Promise.resolve({
          id: `fake-payment-${randomUUID()}`,
          status: 'pending',
          qrCode: 'fake-qr',
        });
      }),
    };
    const context = {
      resolve: jest.fn(() =>
        Promise.resolve({
          tenantId: tenant.id,
          branchId: branch.id,
          userId: profile.id,
          role: Role.Admin,
        }),
      ),
    };
    let cryptoFailures = options?.cryptoFailsOnce ? 1 : 0;
    const crypto = {
      decrypt: jest.fn(() => {
        if (cryptoFailures > 0) {
          cryptoFailures -= 1;
          throw new Error('pre-network failure');
        }
        return { accessToken: 'fake' };
      }),
    };
    const registry = { require: jest.fn(() => provider) };
    const audit = { record: jest.fn() };
    const services = [prismaA, prismaB].map(
      (prisma) =>
        new PaymentsService(
          prisma as any,
          context as any,
          registry as any,
          crypto as any,
          audit as any,
        ),
    );
    const dto = {
      orderId: order.id,
      amountCents: 100,
      idempotencyKey: randomUUID(),
    };
    return {
      tenant,
      branch,
      profile,
      order,
      connection,
      services,
      dto,
      provider,
      calls: () => calls,
    };
  }

  async function concurrent(size: number) {
    const state = await scenario();
    const results = await Promise.all(
      Array.from({ length: size }, (_, index) =>
        state.services[index % state.services.length].createPix(
          { id: state.profile.id } as any,
          state.dto,
          state.branch.id,
        ),
      ),
    );
    expect(state.calls()).toBe(1);
    expect(results).toHaveLength(size);
    expect(results.every((item: any) => item.id || item.executionStatus)).toBe(
      true,
    );
    expect(
      await prismaA!.paymentIdempotencyExecution.count({
        where: {
          tenantId: state.tenant.id,
          idempotencyKey: state.dto.idempotencyKey,
        },
      }),
    ).toBe(1);
  }

  it.each([2, 20, 100])(
    '%i chamadas simultaneas fazem uma chamada externa',
    concurrent,
    30_000,
  );

  it('mesma chave com pedidos diferentes rejeita o payload perdedor', async () => {
    const state = await scenario();
    const secondOrder = await createOrder(prismaA!, {
      tenant: state.tenant,
      branch: state.branch,
    });
    const outcomes = await Promise.allSettled([
      state.services[0].createPix(
        { id: state.profile.id } as any,
        state.dto,
        state.branch.id,
      ),
      state.services[1].createPix(
        { id: state.profile.id } as any,
        { ...state.dto, orderId: secondOrder.id },
        state.branch.id,
      ),
    ]);
    expect(state.calls()).toBe(1);
    expect(outcomes.filter((item) => item.status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(outcomes.filter((item) => item.status === 'rejected')).toHaveLength(
      1,
    );
    expect(
      String(
        (
          outcomes.find(
            (item) => item.status === 'rejected',
          ) as PromiseRejectedResult
        ).reason,
      ),
    ).toContain('outra operacao');
  });

  it('timeout deixa UNKNOWN e concorrentes nao repetem a chamada', async () => {
    const state = await scenario({ providerError: new Error('timeout') });
    const first = await state.services[0].createPix(
      { id: state.profile.id } as any,
      state.dto,
      state.branch.id,
    );
    const second = await state.services[1].createPix(
      { id: state.profile.id } as any,
      state.dto,
      state.branch.id,
    );
    expect(first).toMatchObject({ executionStatus: 'UNKNOWN' });
    expect(second).toMatchObject({ executionStatus: 'UNKNOWN' });
    expect(state.calls()).toBe(1);
  });

  it('falha antes da rede permite recovery sem duplicar chamada externa', async () => {
    const state = await scenario({ cryptoFailsOnce: true });
    await expect(
      state.services[0].createPix(
        { id: state.profile.id } as any,
        state.dto,
        state.branch.id,
      ),
    ).rejects.toThrow('pre-network failure');
    await expect(
      state.services[1].createPix(
        { id: state.profile.id } as any,
        state.dto,
        state.branch.id,
      ),
    ).resolves.toMatchObject({ amountCents: 100 });
    expect(state.calls()).toBe(1);
  });

  it('a mesma chave e independente entre tenants', async () => {
    const a = await scenario();
    const b = await scenario();
    b.dto.idempotencyKey = a.dto.idempotencyKey;
    await Promise.all([
      a.services[0].createPix({ id: a.profile.id } as any, a.dto, a.branch.id),
      b.services[0].createPix({ id: b.profile.id } as any, b.dto, b.branch.id),
    ]);
    expect(a.calls()).toBe(1);
    expect(b.calls()).toBe(1);
  });
});
