import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingEventType,
  CheckoutSessionStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { BillingEventsService } from './billing-events.service';
import { PaymentGatewayRegistry } from './gateways/payment-gateway.registry';
import { createBillingExternalReference } from './external-reference.util';

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly gateways: PaymentGatewayRegistry,
    private readonly events: BillingEventsService,
  ) {}

  async create(
    user: AuthenticatedUser | undefined,
    planSlug: string,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    if (process.env.BILLING_CHECKOUT_ENABLED?.toLowerCase() === 'false') {
      throw new ForbiddenException('Checkout temporariamente desabilitado.');
    }
    const context = await this.tenantContext.resolve(user, {
      selectedBranchId,
      writable: true,
      allowedRoles: [Role.Admin],
      allowDevSupport: devContextMode?.toLowerCase() === 'support',
    });
    const provider = this.gateways.defaultProvider();
    const mode =
      process.env.BILLING_MODE?.trim() ||
      process.env.MERCADO_PAGO_MODE?.trim() ||
      'production';
    const plan = await this.prisma.plan.findFirst({
      where: { slug: planSlug, isActive: true, deletedAt: null },
      include: {
        gatewayMappings: {
          where: {
            provider,
            mode,
            isActive: true,
          },
          take: 1,
        },
      },
    });
    if (!plan) throw new NotFoundException('Plano nao encontrado.');
    const mapping = plan.gatewayMappings[0];
    if (!mapping)
      throw new ConflictException('Plano sem checkout configurado.');

    const subscription = await this.prisma.subscription.findFirst({
      where: { tenantId: context.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    if (!subscription) {
      throw new ConflictException(
        'Tenant sem subscription. Execute o backfill de billing antes do checkout.',
      );
    }
    const externalReference = createBillingExternalReference();
    const profile = await this.prisma.userProfile.findUnique({
      where: { id: context.userId },
      select: { email: true },
    });
    if (!profile?.email)
      throw new ConflictException('Perfil sem e-mail para assinatura.');
    const publicAppUrl = process.env.PUBLIC_APP_URL?.trim();
    if (!publicAppUrl)
      throw new ConflictException('PUBLIC_APP_URL nao configurada.');
    const gateway = this.gateways.get(mapping.provider);
    const gatewayCheckout = await gateway.createCheckout({
      externalReference,
      amountCents: plan.priceCents,
      currency: plan.currency,
      title: plan.name,
      paymentLinkUrl: mapping.paymentLinkUrl,
      gatewayPlanId: mapping.gatewayPlanId,
      payerEmail: profile.email,
      backUrl: new URL('/api/billing/checkout/return', publicAppUrl).toString(),
    });

    const checkout = await this.prisma.$transaction(async (tx) => {
      const created = await tx.checkoutSession.create({
        data: {
          tenantId: context.tenantId,
          planId: plan.id,
          subscriptionId: subscription?.id,
          provider: mapping.provider,
          gatewayCheckoutId: gatewayCheckout.gatewayCheckoutId,
          checkoutUrl: gatewayCheckout.checkoutUrl,
          externalReference,
          status: CheckoutSessionStatus.OPEN,
          expectedAmountCents: plan.priceCents,
          currency: plan.currency,
          createdById: context.userId,
        },
      });
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          gatewayProvider: mapping.provider,
          gatewaySubscriptionId: gatewayCheckout.gatewaySubscriptionId,
          version: { increment: 1 },
        },
      });
      await this.events.create(
        {
          tenantId: context.tenantId,
          subscriptionId: subscription?.id,
          checkoutSessionId: created.id,
          type: BillingEventType.CHECKOUT_CREATED,
          actorProfileId: context.userId,
          source: 'api',
          metadata: {
            provider: mapping.provider,
            supportsExternalReference:
              gatewayCheckout.supportsExternalReference,
          },
        },
        tx,
      );
      return created;
    });

    return {
      checkoutId: checkout.id,
      checkoutUrl: checkout.checkoutUrl,
      status: checkout.status,
      automaticConfirmationAvailable: gatewayCheckout.supportsExternalReference,
    };
  }

  async status(
    user: AuthenticatedUser | undefined,
    id: string,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.tenantContext.resolve(user, {
      selectedBranchId,
      allowDevSupport: devContextMode?.toLowerCase() === 'support',
    });
    const checkout = await this.prisma.checkoutSession.findFirst({
      where: { id, tenantId: context.tenantId },
      include: {
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
        subscription: { include: { plan: true } },
      },
    });
    if (!checkout) throw new NotFoundException('Checkout nao encontrado.');
    return {
      checkoutId: checkout.id,
      status: checkout.status,
      paymentStatus: checkout.payments[0]?.status ?? null,
      subscriptionStatus: checkout.subscription?.status ?? null,
      automaticConfirmationAvailable: Boolean(checkout.gatewayCheckoutId),
    };
  }
}
