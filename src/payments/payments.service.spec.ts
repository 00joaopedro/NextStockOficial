import { BadGatewayException, ConflictException } from '@nestjs/common';
import {
  PaymentIdempotencyExecutionStatus,
  PaymentProviderCode,
} from '@prisma/client';
import { PaymentsService } from './payments.service';

describe('PaymentsService PIX idempotency', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const branchId = '22222222-2222-4222-8222-222222222222';
  const orderId = '33333333-3333-4333-8333-333333333333';
  const connectionId = '44444444-4444-4444-8444-444444444444';

  function fixture(providerError?: Error) {
    let execution: any;
    let transaction: any;
    const provider = {
      createPixPayment: jest.fn(async () => {
        if (providerError) throw providerError;
        return { id: 'pay-1', status: 'pending', qrCode: 'safe-qr' };
      }),
    };
    const prisma: any = {
      order: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: orderId, totalCents: 1500 }),
      },
      paymentRoutingPreference: {
        findUnique: jest.fn().mockResolvedValue({
          isActive: true,
          connection: {
            id: connectionId,
            tenantId,
            providerCode: PaymentProviderCode.MERCADO_PAGO,
            status: 'ACTIVE',
            encryptedCredentials: 'encrypted',
            version: 1,
          },
        }),
      },
      paymentConnection: {
        findFirst: jest.fn().mockResolvedValue({
          id: connectionId,
          tenantId,
          providerCode: PaymentProviderCode.MERCADO_PAGO,
          status: 'ACTIVE',
          encryptedCredentials: 'encrypted',
          version: 1,
        }),
      },
      paymentIdempotencyExecution: {
        create: jest.fn(async ({ data }: any) => {
          execution = {
            id: 'execution-1',
            ...data,
            status: PaymentIdempotencyExecutionStatus.CLAIMED,
            attemptCount: 1,
          };
          return execution;
        }),
        updateMany: jest.fn(async ({ data }: any) => {
          execution = { ...execution, ...data };
          return { count: 1 };
        }),
        update: jest.fn(async ({ data }: any) => {
          execution = { ...execution, ...data };
          return execution;
        }),
        findUnique: jest.fn(async () => execution),
      },
      paymentTransaction: {
        findFirst: jest.fn(async () => transaction),
        upsert: jest.fn(async ({ create }: any) => {
          transaction = { id: 'transaction-1', ...create };
          return transaction;
        }),
      },
      $transaction: jest.fn(async (callback: any) => callback(prisma)),
    };
    const service = new PaymentsService(
      prisma,
      {
        resolve: jest.fn().mockResolvedValue({
          tenantId,
          branchId,
          userId: 'user-1',
          role: 'Admin',
        }),
      } as any,
      { require: jest.fn().mockReturnValue(provider) } as any,
      {
        decrypt: jest.fn().mockReturnValue({ accessToken: 'not-logged' }),
      } as any,
      { record: jest.fn() } as any,
    );
    return { service, prisma, provider, getExecution: () => execution };
  }

  const dto = {
    orderId,
    amountCents: 1500,
    idempotencyKey: 'pix-safe-key-1234',
  };

  it('persiste claim antes de chamar o provider e conclui atomicamente', async () => {
    const { service, prisma, provider, getExecution } = fixture();
    const result = await service.createPix(
      { id: 'user-1' } as any,
      dto,
      branchId,
    );
    expect(
      prisma.paymentIdempotencyExecution.create.mock.invocationCallOrder[0],
    ).toBeLessThan(provider.createPixPayment.mock.invocationCallOrder[0]);
    expect(provider.createPixPayment).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ id: 'transaction-1', amountCents: 1500 });
    expect(getExecution()).toMatchObject({
      status: PaymentIdempotencyExecutionStatus.SUCCEEDED,
      transactionId: 'transaction-1',
    });
  });

  it('marca UNKNOWN quando a chamada iniciada tem resultado ambiguo', async () => {
    const { service, provider, getExecution } = fixture(
      new BadGatewayException('timeout'),
    );
    await expect(
      service.createPix({ id: 'user-1' } as any, dto, branchId),
    ).resolves.toMatchObject({
      executionStatus: PaymentIdempotencyExecutionStatus.UNKNOWN,
      retryable: false,
      reconciliationRequired: true,
    });
    expect(provider.createPixPayment).toHaveBeenCalledTimes(1);
    expect(getExecution().lastErrorCode).not.toContain('timeout');
  });

  it('rejeita chave com formato inseguro antes de criar claim', async () => {
    const { service, prisma } = fixture();
    await expect(
      service.createPix(
        { id: 'user-1' } as any,
        { ...dto, idempotencyKey: 'contains secret spaces' },
        branchId,
      ),
    ).rejects.toThrow('Chave de idempotencia PIX invalida');
    expect(prisma.paymentIdempotencyExecution.create).not.toHaveBeenCalled();
  });

  it('nao inclui chave, hash ou credencial na resposta UNKNOWN', async () => {
    const { service } = fixture(new BadGatewayException('timeout'));
    const result = await service.createPix(
      { id: 'user-1' } as any,
      dto,
      branchId,
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(dto.idempotencyKey);
    expect(serialized).not.toContain('not-logged');
    expect(serialized).not.toMatch(/[a-f0-9]{64}/);
    expect(result).not.toBeInstanceOf(ConflictException);
  });
});
