import {
  CertificateValidationStatus,
  Role,
  SaleStatus,
  SystemMode,
  SystemType,
} from '@prisma/client';
import { Model65DecisionService } from './model65-decision.service';

describe('Model65DecisionService', () => {
  const context = {
    userId: 'user-a',
    tenantId: 'tenant-a',
    branchId: 'branch-a',
    role: Role.Vendedor,
    systemType: SystemType.padrao,
    mode: SystemMode.padrao,
    isDevSuperAdmin: false,
    contextKind: 'normal',
  } as any;
  const sale = {
    id: 'sale-a',
    tenantId: context.tenantId,
    branchId: context.branchId,
    orderId: null,
    sellerNameSnapshot: 'Vendedor',
    paymentMethod: 'pix',
    paymentMachineNameSnapshot: null,
    subtotalCents: 1000,
    discountCents: 0,
    totalCents: 1000,
    paidCents: 1000,
    changeCents: 0,
    soldAt: new Date(),
    status: SaleStatus.paid,
    items: [],
  };

  function setup(config: Record<string, any> | null) {
    const prisma: any = {
      sale: { findFirst: jest.fn().mockResolvedValue(sale) },
      companyFiscalConfig: {
        findUnique: jest.fn().mockResolvedValue(config),
      },
    };
    const tenantContext: any = {
      resolve: jest.fn().mockResolvedValue(context),
    };
    const internalReceipt: any = {
      issueAndRender: jest.fn().mockResolvedValue({
        documentId: 'receipt-a',
        eventType: 'internal_receipt_printed',
        printNumber: 1,
        html: '<html>RECIBO INTERNO — SEM VALIDADE FISCAL</html>',
      }),
    };
    const nfceAttempt: any = {
      tryAuthorize: jest.fn(),
    };
    return {
      service: new Model65DecisionService(
        prisma,
        tenantContext,
        internalReceipt,
        nfceAttempt,
      ),
      prisma,
      tenantContext,
      internalReceipt,
      nfceAttempt,
    };
  }

  const validConfig = {
    provider: 'real',
    certificatePath: 'tenant-a/branch-a/a.pfx',
    certificatePasswordEncrypted: 'encrypted',
    certificateValidationStatus: CertificateValidationStatus.valid,
    certificateExpiresAt: new Date(Date.now() + 86_400_000),
    certificateCnpj: '11222333000181',
    cnpj: '11222333000181',
    legalName: 'Empresa',
    stateRegistration: '123',
    cityCodeIbge: '3550308',
    state: 'SP',
    nfceSeries: '1',
  };

  it.each([
    ['ausente', null],
    [
      'pendente',
      {
        ...validConfig,
        certificateValidationStatus: CertificateValidationStatus.pending,
      },
    ],
    [
      'invalido',
      {
        ...validConfig,
        certificateValidationStatus: CertificateValidationStatus.invalid,
      },
    ],
    [
      'expirado',
      { ...validConfig, certificateExpiresAt: new Date(Date.now() - 1000) },
    ],
    ['CNPJ divergente', { ...validConfig, certificateCnpj: '99999999000199' }],
    [
      'decrypt error',
      {
        ...validConfig,
        certificateValidationStatus: CertificateValidationStatus.decrypt_error,
      },
    ],
    ['provider mock', { ...validConfig, provider: 'mock' }],
  ])(
    'usa recibo interno para certificado/provider %s',
    async (_name, config) => {
      const { service, nfceAttempt, internalReceipt } = setup(config);
      await expect(
        service.print({ id: 'user-a' } as any, sale.id),
      ).resolves.toMatchObject({
        mode: 'internal_receipt',
        printable: true,
      });
      expect(nfceAttempt.tryAuthorize).not.toHaveBeenCalled();
      expect(internalReceipt.issueAndRender).toHaveBeenCalled();
    },
  );

  it('tenta NFC-e com config valida e usa recibo se provider falhar', async () => {
    const { service, nfceAttempt } = setup(validConfig);
    nfceAttempt.tryAuthorize.mockRejectedValue(new Error('unavailable'));
    await expect(
      service.print({ id: 'user-a' } as any, sale.id),
    ).resolves.toMatchObject({
      mode: 'internal_receipt',
    });
    expect(nfceAttempt.tryAuthorize).toHaveBeenCalledTimes(1);
  });

  it('faz fallback apos timeout de cinco segundos', async () => {
    jest.useFakeTimers();
    try {
      const { service, nfceAttempt, internalReceipt } = setup(validConfig);
      nfceAttempt.tryAuthorize.mockReturnValue(new Promise(() => undefined));
      const pending = service.print({ id: 'user-a' } as any, sale.id);
      await jest.advanceTimersByTimeAsync(5_001);
      await expect(pending).resolves.toMatchObject({
        mode: 'internal_receipt',
      });
      expect(internalReceipt.issueAndRender).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('retorna NFC-e somente quando gateway confirma autorizacao real', async () => {
    const { service, nfceAttempt, internalReceipt } = setup(validConfig);
    nfceAttempt.tryAuthorize.mockResolvedValue({
      authorized: true,
      documentId: 'nfce-a',
      status: 'authorized',
      printable: true,
    });
    await expect(
      service.print({ id: 'user-a' } as any, sale.id),
    ).resolves.toEqual({
      mode: 'nfce65',
      documentId: 'nfce-a',
      status: 'authorized',
      printable: true,
    });
    expect(internalReceipt.issueAndRender).not.toHaveBeenCalled();
  });

  it('sempre consulta venda pelo tenant e branch resolvidos', async () => {
    const { service, prisma, tenantContext } = setup(null);
    await service.print({ id: 'user-a' } as any, sale.id);
    expect(tenantContext.resolve).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        requireBranch: true,
        writable: true,
        allowedRoles: [Role.Admin, Role.Vendedor],
      }),
    );
    expect(prisma.sale.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: sale.id,
          tenantId: context.tenantId,
          branchId: context.branchId,
        }),
      }),
    );
  });
});
