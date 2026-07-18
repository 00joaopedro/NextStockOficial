import { Injectable } from '@nestjs/common';
import { PaymentGatewayProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const configured = String(
      process.env.BILLING_DEFAULT_PROVIDER || 'MERCADO_PAGO',
    ).toUpperCase();
    const provider = configured as PaymentGatewayProvider;
    const mode =
      process.env.BILLING_MODE?.trim() ||
      process.env.MERCADO_PAGO_MODE?.trim() ||
      'production';
    const plans = await this.prisma.plan.findMany({
      where: { isActive: true, deletedAt: null },
      include: {
        gatewayMappings: {
          where: {
            provider,
            mode,
            isActive: true,
          },
          select: { id: true, gatewayPlanId: true },
          take: 1,
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }],
    });
    return plans.map((plan) => ({
      id: plan.id,
      slug: plan.slug,
      name: plan.name,
      description: plan.description,
      priceCents: plan.priceCents,
      currency: plan.currency,
      interval: plan.interval,
      intervalCount: plan.intervalCount,
      features: plan.features,
      sortOrder: plan.sortOrder,
      checkoutAvailable:
        process.env.BILLING_CHECKOUT_ENABLED?.toLowerCase() !== 'false' &&
        Boolean(plan.gatewayMappings[0]?.gatewayPlanId),
    }));
  }
}
