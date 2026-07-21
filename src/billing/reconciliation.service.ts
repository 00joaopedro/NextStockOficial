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
    const gateway = this.gateways.get(checkout.provider);
    const results = checkout.payments[0]?.gatewayPaymentId
      ? [await gateway.syncPayment(checkout.payments[0].gatewayPaymentId!)]
      : await gateway.findPayments(checkout.externalReference);
    if (!results.length) {
      return {
        reconciled: false,
        code: 'PAYMENT_NOT_FOUND',
        message: 'O gateway ainda nao confirmou cobranca para esta assinatura.',
      };
    }
    const processed: Array<
      Awaited<ReturnType<PaymentsService['processVerifiedPayment']>>
    > = [];
    for (const result of results) {
      processed.push(
        await this.payments.processVerifiedPayment(checkout.provider, result),
      );
    }
    return {
      reconciled: true,
      results: processed,
    };
  }

  async reconcilePendingBatch(limit = 100) {
    const checkouts = await this.prisma.checkoutSession.findMany({
      where: {
        gatewayCheckoutId: { not: null },
      },
      orderBy: [{ lastReconciledAt: 'asc' }, { createdAt: 'asc' }],
      take: Math.min(Math.max(limit, 1), 500),
    });
    const summary = {
      checked: checkouts.length,
      processed: 0,
      missing: 0,
      failed: 0,
    };
    for (const checkout of checkouts) {
      try {
        const results = await this.gateways
          .get(checkout.provider)
          .findPayments(checkout.externalReference);
        if (!results.length) {
          summary.missing += 1;
          continue;
        }
        for (const result of results) {
          const processed = await this.payments.processVerifiedPayment(
            checkout.provider,
            result,
          );
          if (processed.processed) summary.processed += 1;
        }
      } catch {
        summary.failed += 1;
      } finally {
        await this.prisma.checkoutSession.update({
          where: { id: checkout.id },
          data: { lastReconciledAt: new Date() },
        });
      }
    }
    return summary;
  }
}
