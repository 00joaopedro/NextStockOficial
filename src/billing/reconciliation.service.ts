import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { PaymentGatewayRegistry } from './gateways/payment-gateway.registry';
import { PaymentsService } from './payments.service';

@Injectable()
export class ReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly gateways: PaymentGatewayRegistry,
    private readonly payments: PaymentsService,
  ) {}

  async sync(
    user: AuthenticatedUser | undefined,
    checkoutId: string,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.tenantContext.resolve(user, {
      selectedBranchId,
      writable: true,
      allowedRoles: [Role.Admin],
      allowDevSupport: devContextMode?.toLowerCase() === 'support',
    });
    const checkout = await this.prisma.checkoutSession.findFirst({
      where: { id: checkoutId, tenantId: context.tenantId },
      include: {
        payments: {
          where: { gatewayPaymentId: { not: null } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!checkout) throw new NotFoundException('Checkout nao encontrado.');
    const gatewayPaymentId = checkout.payments[0]?.gatewayPaymentId;
    if (!gatewayPaymentId) {
      return {
        reconciled: false,
        code: 'CORRELATION_UNAVAILABLE',
        message:
          'O link fixo nao forneceu uma referencia verificavel. Uma preference dinamica ou preapproval e necessaria para conciliacao automatica.',
      };
    }
    const result = await this.gateways
      .get(checkout.provider)
      .syncPayment(gatewayPaymentId);
    return {
      reconciled: true,
      result: await this.payments.processVerifiedPayment(
        checkout.provider,
        result,
      ),
    };
  }
}
