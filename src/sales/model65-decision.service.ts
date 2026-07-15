import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CertificateValidationStatus, Role, SaleStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { InternalReceiptService } from './internal-receipt.service';
import { NfceAttemptService } from './nfce-attempt.service';

const SALE_FOR_RECEIPT = {
  items: { orderBy: { createdAt: 'asc' as const } },
} as const;

@Injectable()
export class Model65DecisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly internalReceipt: InternalReceiptService,
    private readonly nfceAttempt: NfceAttemptService,
  ) {}

  async print(
    user: AuthenticatedUser | undefined,
    saleId: string,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.tenantContext.resolve(user, {
      selectedBranchId,
      requireBranch: true,
      writable: true,
      allowedRoles: [Role.Admin, Role.Vendedor],
      allowDevSupport: devContextMode?.toLowerCase() === 'support',
    });
    const sale = await this.prisma.sale.findFirst({
      where: {
        id: saleId,
        tenantId: context.tenantId,
        branchId: context.branchId!,
        deletedAt: null,
      },
      include: SALE_FOR_RECEIPT,
    });
    if (!sale) throw new NotFoundException('Venda nao encontrada.');
    if (sale.status !== SaleStatus.paid) {
      throw new BadRequestException(
        'Somente uma venda paga pode gerar recibo ou NFC-e.',
      );
    }

    const config = await this.prisma.companyFiscalConfig.findUnique({
      where: {
        tenantId_branchId: {
          tenantId: context.tenantId,
          branchId: context.branchId!,
        },
      },
    });

    if (this.isFiscalReady(config)) {
      try {
        const result = await withTimeout(
          (signal) => this.nfceAttempt.tryAuthorize(signal),
          5_000,
        );
        if (result.authorized) {
          return {
            mode: 'nfce65' as const,
            status: result.status,
            printable: result.printable,
            documentId: result.documentId,
          };
        }
      } catch {
        // A venda nao pode ser bloqueada por indisponibilidade fiscal.
      }
    }

    const receipt = await this.internalReceipt.issueAndRender({
      sale,
      context: {
        userId: context.userId,
        tenantId: context.tenantId,
        branchId: context.branchId!,
      },
      origin: 'cash_register',
    });
    return {
      mode: 'internal_receipt' as const,
      printable: true,
      html: receipt.html,
      documentId: receipt.documentId,
      printEvent: receipt.eventType,
      printNumber: receipt.printNumber,
    };
  }

  private isFiscalReady(config: Record<string, any> | null) {
    if (!config || config.provider === 'mock') return false;
    if (
      !config.certificatePath ||
      !config.certificatePasswordEncrypted ||
      config.certificateValidationStatus !==
        CertificateValidationStatus.valid ||
      !config.certificateExpiresAt ||
      config.certificateExpiresAt <= new Date()
    ) {
      return false;
    }
    if (
      config.certificateCnpj &&
      digits(config.certificateCnpj) !== digits(config.cnpj)
    ) {
      return false;
    }
    return Boolean(
      config.legalName?.trim() &&
      config.cnpj?.trim() &&
      config.stateRegistration?.trim() &&
      config.cityCodeIbge?.trim() &&
      config.state?.trim() &&
      config.nfceSeries?.trim(),
    );
  }
}

async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
) {
  let timer: NodeJS.Timeout | undefined;
  const controller = new AbortController();
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('NFCE_AUTHORIZATION_TIMEOUT'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function digits(value?: string | null) {
  return String(value || '').replace(/\D/g, '');
}
