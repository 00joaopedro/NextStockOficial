import { ConflictException } from '@nestjs/common';
import {
  PaymentConnectionStatus,
  PaymentProviderCode,
  Role,
} from '@prisma/client';
import { PaymentsService } from './payments.service';

describe('PaymentsService connection validation CAS (RC-011)', () => {
  const connection = {
    id: 'connection-id',
    tenantId: 'tenant-id',
    providerCode: PaymentProviderCode.MERCADO_PAGO,
    status: PaymentConnectionStatus.ACTIVE,
    version: 7,
    encryptedCredentials: 'encrypted-v7',
  };
  const context = {
    tenantId: 'tenant-id',
    branchId: 'branch-id',
    userId: 'user-id',
    role: Role.Admin,
  };

  function setup(input?: {
    count?: number;
    currentStatus?: PaymentConnectionStatus;
    providerError?: Error;
  }) {
    const prisma = {
      paymentConnection: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(connection)
          .mockResolvedValue({
            status: input?.currentStatus ?? PaymentConnectionStatus.ACTIVE,
            version: 8,
          }),
        updateMany: jest.fn().mockResolvedValue({ count: input?.count ?? 1 }),
      },
    };
    const adapter = {
      validateConnection: input?.providerError
        ? jest.fn().mockRejectedValue(input.providerError)
        : jest.fn().mockResolvedValue({
            externalAccountId: 'external-account',
            capabilities: ['PIX'],
          }),
    };
    const crypto = {
      decrypt: jest.fn().mockReturnValue({ accessToken: 'secret-token' }),
      encrypt: jest.fn().mockReturnValue('encrypted-v8'),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new PaymentsService(
      prisma as any,
      { resolve: jest.fn().mockResolvedValue(context) } as any,
      { get: jest.fn().mockReturnValue(adapter) } as any,
      crypto as any,
      audit as any,
    );
    return { service, prisma, adapter, crypto, audit };
  }

  it('applies a successful result only with the tenant/version/status CAS', async () => {
    const { service, prisma, crypto } = setup();

    await expect(
      service.validateConnection(undefined, connection.id, context.branchId),
    ).resolves.toEqual({
      valid: true,
      externalAccountId: 'external-account',
      capabilities: ['PIX'],
    });
    expect(prisma.paymentConnection.updateMany).toHaveBeenCalledWith({
      where: {
        id: connection.id,
        tenantId: connection.tenantId,
        providerCode: connection.providerCode,
        version: connection.version,
        status: {
          in: [
            PaymentConnectionStatus.PENDING,
            PaymentConnectionStatus.ACTIVE,
            PaymentConnectionStatus.EXPIRED,
            PaymentConnectionStatus.ERROR,
          ],
        },
      },
      data: expect.objectContaining({
        status: PaymentConnectionStatus.ACTIVE,
        encryptedCredentials: 'encrypted-v8',
        version: { increment: 1 },
      }),
    });
    expect(crypto.encrypt).toHaveBeenCalledWith(
      { accessToken: 'secret-token' },
      connection.tenantId,
      connection.id,
      8,
    );
  });

  it('reloads state and returns 409 when revoke wins the CAS', async () => {
    const { service, audit } = setup({
      count: 0,
      currentStatus: PaymentConnectionStatus.REVOKED,
    });

    await expect(
      service.validateConnection(undefined, connection.id, context.branchId),
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({
        connectionStatus: PaymentConnectionStatus.REVOKED,
        currentVersion: 8,
        snapshotVersion: 7,
      }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'payment.connection.validation_discarded_after_revoke',
      }),
    );
    expect(audit.record).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'payment.connection.validated' }),
    );
  });

  it('does not apply an old provider failure after revoke', async () => {
    const { service, prisma } = setup({
      count: 0,
      currentStatus: PaymentConnectionStatus.REVOKED,
      providerError: new Error('provider rejected'),
    });

    await expect(
      service.validateConnection(undefined, connection.id, context.branchId),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.paymentConnection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PaymentConnectionStatus.ERROR,
          version: { increment: 1 },
        }),
      }),
    );
  });

  it('rejects a revoked snapshot before decrypting or calling the provider', async () => {
    const { service, prisma, adapter, crypto } = setup();
    prisma.paymentConnection.findFirst.mockReset().mockResolvedValue({
      ...connection,
      status: PaymentConnectionStatus.REVOKED,
      encryptedCredentials: null,
    });

    await expect(
      service.validateConnection(undefined, connection.id, context.branchId),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(crypto.decrypt).not.toHaveBeenCalled();
    expect(adapter.validateConnection).not.toHaveBeenCalled();
    expect(prisma.paymentConnection.updateMany).not.toHaveBeenCalled();
  });
});
