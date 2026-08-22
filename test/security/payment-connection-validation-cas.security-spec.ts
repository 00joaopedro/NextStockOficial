import { ConflictException } from '@nestjs/common';
import {
  PaymentConnectionStatus,
  PaymentMethod,
  PaymentProviderCode,
  PaymentRoutingContext,
  PrismaClient,
  Role,
} from '@prisma/client';
import { PaymentsService } from '../../src/payments/payments.service';
import { createBranch, createTenant } from './payment-idempotency-fixtures';
import {
  assertSafeTestDatabaseUrl,
  hasSecurityTestDatabase,
} from '../helpers/test-database.guard';

class ValidationBarrierAdapter {
  readonly code = PaymentProviderCode.MERCADO_PAGO;
  private readonly calls: Array<{
    resolve: (value: {
      externalAccountId: string;
      capabilities: string[];
    }) => void;
    reject: (reason: Error) => void;
  }> = [];
  private readonly callWaiters: Array<{
    count: number;
    resolve: () => void;
  }> = [];

  get pendingCalls() {
    return this.calls.length;
  }

  validateConnection() {
    return new Promise<{
      externalAccountId: string;
      capabilities: string[];
    }>((resolve, reject) => {
      this.calls.push({ resolve, reject });
      for (let index = this.callWaiters.length - 1; index >= 0; index -= 1) {
        const waiter = this.callWaiters[index];
        if (this.calls.length >= waiter.count) {
          this.callWaiters.splice(index, 1);
          waiter.resolve();
        }
      }
    });
  }

  waitForCalls(count: number, timeoutMs = 1_000) {
    if (this.calls.length >= count) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(`only ${this.calls.length}/${count} validations started`),
        );
      }, timeoutMs);
      this.callWaiters.push({
        count,
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
      });
    });
  }

  releaseSuccess(index = 0) {
    const call = this.calls[index];
    if (!call)
      throw new Error(
        `cannot release validation ${index}; only ${this.calls.length} arrived`,
      );
    call.resolve({
      externalAccountId: `account-${index}`,
      capabilities: ['PIX'],
    });
  }

  releaseFailure(index = 0) {
    const call = this.calls[index];
    if (!call)
      throw new Error(
        `cannot release validation ${index}; only ${this.calls.length} arrived`,
      );
    call.reject(new Error('deterministic provider rejection'));
  }

  rejectPending(
    reason = new Error('RC-011 test cleanup: unresolved validation'),
  ) {
    for (const call of this.calls) call.reject(reason);
  }
}

function service(
  prisma: PrismaClient,
  tenantId: string,
  branchId: string,
  adapter: ValidationBarrierAdapter,
  audit = { record: jest.fn().mockResolvedValue(undefined) },
) {
  return {
    audit,
    value: new PaymentsService(
      prisma as any,
      {
        resolve: jest.fn().mockResolvedValue({
          tenantId,
          branchId,
          userId: undefined,
          role: Role.Admin,
        }),
      } as any,
      { get: jest.fn().mockReturnValue(adapter) } as any,
      {
        decrypt: jest.fn().mockReturnValue({ accessToken: 'fixture-secret' }),
        encrypt: jest
          .fn()
          .mockImplementation(
            (_credentials, _tenant, _id, version) =>
              `fixture-encrypted-v${version}`,
          ),
      } as any,
      audit as any,
    ),
  };
}

describe('RC-011 payment connection validation CAS', () => {
  let prismaA: PrismaClient;
  let prismaB: PrismaClient;
  const databaseUrl = hasSecurityTestDatabase()
    ? assertSafeTestDatabaseUrl(process.env.SECURITY_TEST_DATABASE_URL)
    : undefined;

  beforeAll(async () => {
    if (!databaseUrl)
      throw new Error('SECURITY_TEST_DATABASE_URL is required for RC-011.');
    const url = new URL(databaseUrl);
    url.searchParams.set('connection_limit', '10');
    prismaA = new PrismaClient({ datasourceUrl: url.toString() });
    prismaB = new PrismaClient({ datasourceUrl: url.toString() });
    await Promise.all([prismaA.$connect(), prismaB.$connect()]);
  });

  afterAll(async () => {
    await Promise.all([prismaA?.$disconnect(), prismaB?.$disconnect()]);
  });

  async function fixture() {
    const tenant = await createTenant(prismaA);
    const branch = await createBranch(prismaA, tenant);
    const connection = await prismaA.paymentConnection.create({
      data: {
        tenantId: tenant.id,
        providerCode: PaymentProviderCode.MERCADO_PAGO,
        displayName: 'RC-011 fake provider',
        status: PaymentConnectionStatus.ACTIVE,
        encryptedCredentials: 'fixture-encrypted-v1',
        capabilities: ['PIX'],
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
    return { tenant, branch, connection };
  }

  async function cleanup(tenantId: string) {
    await prismaA.paymentRoutingPreference.deleteMany({ where: { tenantId } });
    await prismaA.paymentConnection.deleteMany({ where: { tenantId } });
    await prismaA.branch.deleteMany({ where: { tenantId } });
    await prismaA.tenant.delete({ where: { id: tenantId } });
  }

  async function validationsVersusRevoke(size: number, failure = false) {
    const { tenant, branch, connection } = await fixture();
    const adapter = new ValidationBarrierAdapter();
    const a = service(prismaA, tenant.id, branch.id, adapter);
    const b = service(prismaB, tenant.id, branch.id, adapter);
    try {
      const validations = Array.from({ length: size }, () =>
        a.value.validateConnection(undefined, connection.id, branch.id),
      );
      await adapter.waitForCalls(size);
      await b.value.revokeConnection(undefined, connection.id, branch.id);
      const afterRevoke = await prismaB.paymentConnection.findUniqueOrThrow({
        where: { id: connection.id },
      });
      expect(afterRevoke).toMatchObject({
        status: PaymentConnectionStatus.REVOKED,
        encryptedCredentials: null,
        version: connection.version + 1,
      });
      expect(
        await prismaB.paymentRoutingPreference.count({
          where: { tenantId: tenant.id, connectionId: connection.id },
        }),
      ).toBe(0);

      for (let index = 0; index < size; index += 1) {
        if (failure) adapter.releaseFailure(index);
        else adapter.releaseSuccess(index);
      }
      const results = await Promise.allSettled(validations);
      expect(results).toHaveLength(size);
      for (const result of results) {
        expect(result.status).toBe('rejected');
        if (result.status === 'rejected')
          expect(result.reason).toBeInstanceOf(ConflictException);
      }
      const final = await prismaA.paymentConnection.findUniqueOrThrow({
        where: { id: connection.id },
      });
      expect(final).toMatchObject({
        status: PaymentConnectionStatus.REVOKED,
        encryptedCredentials: null,
        version: connection.version + 1,
      });
      expect(a.audit.record).not.toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'payment.connection.validated' }),
      );
    } finally {
      await cleanup(tenant.id);
    }
  }

  it.each([2, 20, 100])(
    'keeps revoke terminal against %i delayed successful validations',
    async (size) => validationsVersusRevoke(size),
  );

  it('keeps revoke terminal against a delayed failed validation', async () => {
    await validationsVersusRevoke(1, true);
  });

  it('allows only one of two out-of-order validations from one version', async () => {
    const { tenant, branch, connection } = await fixture();
    const adapter = new ValidationBarrierAdapter();
    const a = service(prismaA, tenant.id, branch.id, adapter);
    const b = service(prismaB, tenant.id, branch.id, adapter);
    let first: Promise<unknown> | undefined;
    let second: Promise<unknown> | undefined;
    try {
      first = a.value.validateConnection(undefined, connection.id, branch.id);
      second = b.value.validateConnection(undefined, connection.id, branch.id);
      await adapter.waitForCalls(2);
      adapter.releaseSuccess(1);
      const firstResponse = first.then(
        (result) => ({ promise: 'first', result }),
        () => ({ promise: 'first', rejected: true }),
      );
      const secondResponse = second.then(
        (result) => ({ promise: 'second', result }),
        () => ({ promise: 'second', rejected: true }),
      );
      await expect(
        Promise.race([firstResponse, secondResponse]),
      ).resolves.toMatchObject({
        result: { valid: true },
      });
      adapter.releaseSuccess(0);
      const results = await Promise.allSettled([first, second]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);
      const rejected = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected',
      );
      expect(rejected?.reason).toBeInstanceOf(ConflictException);
      const final = await prismaA.paymentConnection.findUniqueOrThrow({
        where: { id: connection.id },
      });
      expect(final.version).toBe(connection.version + 1);
      expect(final.externalAccountId).toBe('account-1');
    } finally {
      adapter.rejectPending();
      await Promise.allSettled(
        [first, second].filter(
          (promise): promise is Promise<unknown> => promise !== undefined,
        ),
      );
      await cleanup(tenant.id);
    }
  }, 15_000);

  it('rejects cross-tenant validation without calling the provider', async () => {
    const own = await fixture();
    const foreign = await fixture();
    const adapter = new ValidationBarrierAdapter();
    const foreignService = service(
      prismaB,
      foreign.tenant.id,
      foreign.branch.id,
      adapter,
    );
    try {
      await expect(
        foreignService.value.validateConnection(
          undefined,
          own.connection.id,
          foreign.branch.id,
        ),
      ).rejects.toMatchObject({ status: 404 });
      expect(adapter.pendingCalls).toBe(0);
    } finally {
      await cleanup(own.tenant.id);
      await cleanup(foreign.tenant.id);
    }
  });
});
