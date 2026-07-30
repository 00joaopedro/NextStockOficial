import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
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
import { GatewayCheckoutError } from './gateways/payment-gateway.interface';
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
    idempotencyKey: string | undefined,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    if (
      !idempotencyKey ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(idempotencyKey)
    ) {
      throw new BadRequestException(
        'Idempotency-Key obrigatoria (8-128 caracteres seguros).',
      );
    }
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
    const payloadHash = createHash('sha256')
      .update(JSON.stringify({ operation: 'CREATE_CHECKOUT', planSlug }))
      .digest('hex');
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
    const gatewayIdempotencyKey = createHash('sha256')
      .update(`${context.tenantId}:CREATE_CHECKOUT:${idempotencyKey}`)
      .digest('hex');
    const claimToken = randomUUID();
    let intent: any;
    let ownsClaim = false;
    try {
      intent = await this.prisma.billingCheckoutIntent.create({
        data: {
          tenantId: context.tenantId,
          subscriptionId: subscription.id,
          planId: plan.id,
          provider: mapping.provider,
          idempotencyKey,
          payloadHash,
          externalReference: createBillingExternalReference(),
          claimToken,
          leaseExpiresAt: new Date(Date.now() + 60_000),
        },
      });
      ownsClaim = true;
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      )
        throw error;
      intent = await this.prisma.billingCheckoutIntent.findUniqueOrThrow({
        where: {
          tenantId_operation_idempotencyKey: {
            tenantId: context.tenantId,
            operation: 'CREATE_CHECKOUT',
            idempotencyKey,
          },
        },
        include: { checkoutSession: true },
      });
      if (intent.payloadHash !== payloadHash) {
        throw new ConflictException(
          'Idempotency-Key reutilizada com payload divergente.',
        );
      }
      if (intent.state === 'SUCCEEDED' && intent.checkoutSession) {
        return this.result(intent.checkoutSession, true);
      }
      if (
        intent.state === 'UNKNOWN' &&
        !gateway.supportsIdempotentCheckoutRecovery
      ) {
        return {
          checkoutId: null,
          checkoutUrl: null,
          status: 'UNKNOWN',
          recoverable: false,
          automaticConfirmationAvailable: false,
        };
      }
      if (intent.state === 'FAILED_RETRYABLE' || intent.state === 'UNKNOWN') {
        const claimed = await this.prisma.billingCheckoutIntent.updateMany({
          where: {
            id: intent.id,
            claimToken: intent.claimToken,
            state: intent.state,
          },
          data: {
            state: 'CLAIMED',
            claimToken,
            leaseExpiresAt: new Date(Date.now() + 60_000),
            failureCode: null,
          },
        });
        ownsClaim = claimed.count === 1;
        if (ownsClaim) intent = { ...intent, claimToken, state: 'CLAIMED' };
      }
      if (!ownsClaim)
        return {
          checkoutId: intent.checkoutSessionId ?? null,
          checkoutUrl: null,
          status: intent.state,
          recoverable: true,
          automaticConfirmationAvailable: false,
        };
    }

    await this.prisma.billingCheckoutIntent.updateMany({
      where: { id: intent.id, claimToken, state: 'CLAIMED' },
      data: { state: 'PROCESSING' },
    });
    let gatewayCheckout;
    try {
      gatewayCheckout = await gateway.createCheckout({
        idempotencyKey: gatewayIdempotencyKey,
        externalReference: intent.externalReference,
        amountCents: plan.priceCents,
        currency: plan.currency,
        title: plan.name,
        paymentLinkUrl: mapping.paymentLinkUrl,
        gatewayPlanId: mapping.gatewayPlanId,
        payerEmail: profile.email,
        backUrl: new URL(
          '/api/billing/checkout/return',
          publicAppUrl,
        ).toString(),
      });
    } catch (error) {
      await this.prisma.billingCheckoutIntent.updateMany({
        where: { id: intent.id, claimToken, state: 'PROCESSING' },
        data: {
          state:
            error instanceof GatewayCheckoutError && !error.networkStarted
              ? 'FAILED_RETRYABLE'
              : 'UNKNOWN',
          failureCode:
            error instanceof GatewayCheckoutError && !error.networkStarted
              ? 'GATEWAY_NOT_STARTED'
              : 'GATEWAY_RESULT_UNKNOWN',
        },
      });
      throw error;
    }

    let checkout;
    try {
      await this.afterGatewayCheckoutCreated();
      checkout = await this.prisma.$transaction(async (tx) => {
        const created = await tx.checkoutSession.create({
          data: {
            tenantId: context.tenantId,
            planId: plan.id,
            subscriptionId: subscription?.id,
            provider: mapping.provider,
            gatewayCheckoutId: gatewayCheckout.gatewayCheckoutId,
            checkoutUrl: gatewayCheckout.checkoutUrl,
            externalReference: intent.externalReference,
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
        const applied = await tx.billingCheckoutIntent.updateMany({
          where: { id: intent.id, claimToken, state: 'PROCESSING' },
          data: { state: 'SUCCEEDED', checkoutSessionId: created.id },
        });
        if (applied.count !== 1)
          throw new ConflictException('Claim de checkout expirou.');
        return created;
      });
    } catch (error) {
      await this.prisma.billingCheckoutIntent.updateMany({
        where: { id: intent.id, claimToken, state: 'PROCESSING' },
        data: { state: 'UNKNOWN', failureCode: 'LOCAL_COMMIT_AFTER_GATEWAY' },
      });
      throw error;
    }

    return this.result(checkout, gatewayCheckout.supportsExternalReference);
  }

  /** Lifecycle seam for observability/fault-injection without gateway-specific code. */
  protected afterGatewayCheckoutCreated(): Promise<void> {
    return Promise.resolve();
  }

  private result(checkout: any, automaticConfirmationAvailable: boolean) {
    return {
      checkoutId: checkout.id,
      checkoutUrl: checkout.checkoutUrl,
      status: checkout.status,
      automaticConfirmationAvailable,
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
