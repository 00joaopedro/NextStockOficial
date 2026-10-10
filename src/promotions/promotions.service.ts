import {
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingPaymentStatus,
  Prisma,
  PromotionCampaignStatus,
  PromotionReservationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  getPromotionOffer,
  NORMAL_PAYMENT_LINKS,
  NORMAL_PLAN_ID_ENVS,
  PROMOTION_OFFERS,
} from './promotion-offers';

const DEFAULT_RESERVATION_TTL_MS = 30 * 60 * 1000;

type ReserveInput = {
  slug: string;
  tenantId: string;
  idempotencyKey?: string;
  partnerId?: string | null;
  planSlug?: string;
  periodMonths?: number;
};

type CampaignSnapshot = {
  id: string;
  slug: string;
  name: string;
  status: PromotionCampaignStatus;
  maxConversions: number;
  reservedCount: number;
  convertedCount: number;
  trialDays: number;
  startsAt: Date | null;
  endsAt: Date | null;
};

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicContext(slug: string, now = new Date()) {
    const campaign = await this.findCampaign(slug);
    await this.expireReservations(campaign.id, now);

    let current = await this.prisma.promotionCampaign.findUniqueOrThrow({
      where: { id: campaign.id },
    });

    if (
      current.status === PromotionCampaignStatus.ACTIVE &&
      current.convertedCount >= current.maxConversions
    ) {
      await this.prisma.promotionCampaign.updateMany({
        where: {
          id: current.id,
          status: PromotionCampaignStatus.ACTIVE,
        },
        data: {
          status: PromotionCampaignStatus.EXHAUSTED,
          closedAt: now,
          closeReason: 'LIMIT_REACHED',
        },
      });
      current = await this.prisma.promotionCampaign.findUniqueOrThrow({
        where: { id: current.id },
      });
    } else if (
      current.status === PromotionCampaignStatus.ACTIVE &&
      current.endsAt &&
      current.endsAt <= now
    ) {
      await this.prisma.promotionCampaign.updateMany({
        where: {
          id: current.id,
          status: PromotionCampaignStatus.ACTIVE,
        },
        data: {
          status: PromotionCampaignStatus.CLOSED,
          closedAt: now,
          closeReason: 'TIME_WINDOW_ENDED',
        },
      });
      current = await this.prisma.promotionCampaign.findUniqueOrThrow({
        where: { id: current.id },
      });
    }

    const open = this.isOpen(current, now);
    const remainingSlots = open
      ? Math.max(
          0,
          current.maxConversions -
            current.convertedCount -
            current.reservedCount,
        )
      : 0;

    return {
      slug: current.slug,
      name: current.name,
      status: current.status,
      isOpen: open && remainingSlots > 0,
      trialDays: current.trialDays,
      maxConversions: current.maxConversions,
      reservedConversions: current.reservedCount,
      convertedConversions: current.convertedCount,
      remainingSlots,
      startsAt: current.startsAt,
      endsAt: current.endsAt,
      closedAt: current.closedAt,
      closeReason: current.closeReason,
    };
  }

  async reserveForTenant(input: ReserveInput) {
    const idempotencyKey = input.idempotencyKey?.trim();
    if (
      !idempotencyKey ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(idempotencyKey)
    ) {
      throw new ConflictException(
        'Idempotency-Key obrigatoria para reservar a vaga promocional.',
      );
    }

    const campaign = await this.findCampaign(input.slug);
    const offer = getPromotionOffer(input.planSlug, input.periodMonths);
    if (!offer || offer.campaignSlug !== campaign.slug) {
      throw new ConflictException('Oferta promocional inválida para esta campanha.');
    }
    await this.expireReservations(campaign.id);

    const existing = await this.prisma.promotionReservation.findUnique({
      where: {
        campaignId_tenantId: {
          campaignId: campaign.id,
          tenantId: input.tenantId,
        },
      },
    });
    if (
      existing &&
      (existing.status === PromotionReservationStatus.CONVERTED ||
        (existing.status === PromotionReservationStatus.RESERVED &&
          existing.expiresAt > new Date()))
    ) {
      return this.formatReservation(existing, campaign);
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: { id: true, createdAt: true },
    });
    if (!tenant) throw new NotFoundException('Tenant da promoção não encontrado.');

    if (campaign.startsAt && tenant.createdAt < campaign.startsAt) {
      throw new ConflictException(
        'A promoção é válida somente para novos tenants.',
      );
    }

    const previousPaidPayment = await this.prisma.billingPayment.count({
      where: {
        tenantId: input.tenantId,
        status: {
          in: [
            BillingPaymentStatus.APPROVED,
            BillingPaymentStatus.REFUNDED,
            BillingPaymentStatus.CHARGEBACK,
          ],
        },
      },
    });
    if (previousPaidPayment > 0) {
      throw new ConflictException(
        'Este tenant já possui histórico de pagamento e não é elegível.',
      );
    }

    const expiresAt = new Date(Date.now() + DEFAULT_RESERVATION_TTL_MS);

    try {
      const reservation = await this.prisma.$transaction(async (tx) => {
        const reservedAt = new Date();

        if (existing) {
          const recycled = await tx.promotionReservation.updateMany({
            where: {
              id: existing.id,
              OR: [
                { status: PromotionReservationStatus.RELEASED },
                { status: PromotionReservationStatus.EXPIRED },
                {
                  status: PromotionReservationStatus.RESERVED,
                  expiresAt: { lte: reservedAt },
                },
              ],
            },
            data: {
              partnerId: input.partnerId ?? existing.partnerId,
              idempotencyKey,
              status: PromotionReservationStatus.RESERVED,
              reservedAt,
              expiresAt,
              convertedAt: null,
              releasedAt: null,
              releaseReason: null,
              metadata: {
                source: 'promotion',
                trialDays: offer.trialDays,
                planSlug: offer.planSlug,
                periodMonths: offer.periodMonths,
                totalPriceCents: offer.totalPriceCents,
                monthlyPriceCents: offer.monthlyPriceCents,
              },
            },
          });

          if (recycled.count !== 1) {
            const current = await tx.promotionReservation.findUnique({
              where: { id: existing.id },
            });
            if (
              current &&
              (current.status === PromotionReservationStatus.CONVERTED ||
                (current.status === PromotionReservationStatus.RESERVED &&
                  current.expiresAt > reservedAt))
            ) {
              return current;
            }
            throw new ConflictException(
              'A reserva promocional já está sendo processada.',
            );
          }
        }

        const claimed = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`UPDATE "promotion_campaigns"
            SET "reserved_count" = "reserved_count" + 1,
                "updated_at" = NOW()
            WHERE "id" = ${campaign.id}
              AND "status" = CAST(${PromotionCampaignStatus.ACTIVE} AS "PromotionCampaignStatus")
              AND ("starts_at" IS NULL OR "starts_at" <= NOW())
              AND ("ends_at" IS NULL OR "ends_at" > NOW())
              AND ("converted_count" + "reserved_count") < "max_conversions"
            RETURNING "id"`,
        );

        if (claimed.length !== 1) {
          throw new GoneException(
            'A campanha promocional está encerrada ou sem vagas.',
          );
        }

        if (existing) {
          await this.setPromotionalTrial(tx, input.tenantId, offer.trialDays);
          return tx.promotionReservation.findUniqueOrThrow({
            where: { id: existing.id },
          });
        }

        const created = await tx.promotionReservation.create({
          data: {
            campaignId: campaign.id,
            tenantId: input.tenantId,
            partnerId: input.partnerId ?? null,
            idempotencyKey,
            expiresAt,
            metadata: {
              source: 'promotion',
              trialDays: offer.trialDays,
              planSlug: offer.planSlug,
              periodMonths: offer.periodMonths,
              totalPriceCents: offer.totalPriceCents,
              monthlyPriceCents: offer.monthlyPriceCents,
            },
          },
        });
        await this.setPromotionalTrial(tx, input.tenantId, offer.trialDays);
        return created;
      });

      return this.formatReservation(reservation, campaign);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const duplicate = await this.prisma.promotionReservation.findUnique({
          where: {
            campaignId_tenantId: {
              campaignId: campaign.id,
              tenantId: input.tenantId,
            },
          },
        });
        if (duplicate) return this.formatReservation(duplicate, campaign);
      }
      throw error;
    }
  }

  async convertReservation(reservationId: string) {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const reservation = await tx.promotionReservation.findUnique({
        where: { id: reservationId },
      });
      if (!reservation) {
        throw new NotFoundException('Reserva promocional não encontrada.');
      }
      if (reservation.status === PromotionReservationStatus.CONVERTED) {
        return reservation;
      }
      if (
        reservation.status !== PromotionReservationStatus.RESERVED ||
        reservation.expiresAt <= now
      ) {
        throw new ConflictException('A reserva promocional não está mais válida.');
      }

      const updated = await tx.promotionReservation.updateMany({
        where: {
          id: reservation.id,
          status: PromotionReservationStatus.RESERVED,
          expiresAt: { gt: now },
        },
        data: {
          status: PromotionReservationStatus.CONVERTED,
          convertedAt: now,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('A reserva promocional já foi processada.');
      }

      await tx.$executeRaw(
        Prisma.sql`UPDATE "promotion_campaigns"
          SET "reserved_count" = GREATEST("reserved_count" - 1, 0),
              "converted_count" = "converted_count" + 1,
              "status" = CASE
                WHEN "converted_count" + 1 >= "max_conversions"
                THEN CAST(${PromotionCampaignStatus.EXHAUSTED} AS "PromotionCampaignStatus")
                ELSE "status"
              END,
              "closed_at" = CASE
                WHEN "converted_count" + 1 >= "max_conversions" THEN COALESCE("closed_at", NOW())
                ELSE "closed_at"
              END,
              "close_reason" = CASE
                WHEN "converted_count" + 1 >= "max_conversions" THEN COALESCE("close_reason", 'LIMIT_REACHED')
                ELSE "close_reason"
              END,
              "updated_at" = NOW()
          WHERE "id" = ${reservation.campaignId}`,
      );

      return tx.promotionReservation.findUniqueOrThrow({
        where: { id: reservation.id },
      });
    });
  }

  async releaseReservation(reservationId: string, reason = 'RELEASED') {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.promotionReservation.updateMany({
        where: {
          id: reservationId,
          status: PromotionReservationStatus.RESERVED,
        },
        data: {
          status: PromotionReservationStatus.RELEASED,
          releasedAt: new Date(),
          releaseReason: reason.slice(0, 120),
        },
      });
      if (updated.count !== 1) {
        return tx.promotionReservation.findUnique({
          where: { id: reservationId },
        });
      }

      const reservation = await tx.promotionReservation.findUniqueOrThrow({
        where: { id: reservationId },
      });
      await tx.promotionCampaign.updateMany({
        where: {
          id: reservation.campaignId,
          reservedCount: { gt: 0 },
        },
        data: { reservedCount: { decrement: 1 } },
      });
      return reservation;
    });
  }

  async getAdminDashboard(slug: string) {
    const campaign = await this.findCampaign(slug);
    const [reservations, payments, context] = await Promise.all([
      this.listAdminReservations(campaign.id),
      this.listAdminPayments(campaign.id),
      this.getPublicContext(slug),
    ]);
    return {
      campaign: context,
      configuration: this.getProductionConfiguration(),
      reservations,
      payments,
    };
  }

  async listAdminReservations(campaignId: string) {
    const rows = await this.prisma.promotionReservation.findMany({
      where: { campaignId },
      orderBy: { reservedAt: 'desc' },
    });
    const tenantIds = rows.map((row) => row.tenantId);
    const tenants = await this.prisma.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true, name: true, createdAt: true },
    });
    const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]));
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      tenant: tenantById.get(row.tenantId) ?? null,
      partnerId: row.partnerId,
      status: row.status,
      reservedAt: row.reservedAt,
      expiresAt: row.expiresAt,
      convertedAt: row.convertedAt,
      metadata: row.metadata,
    }));
  }

  async listAdminPayments(campaignId: string) {
    const reservations = await this.prisma.promotionReservation.findMany({
      where: { campaignId, checkoutSessionId: { not: null } },
      select: { checkoutSessionId: true },
    });
    const checkoutSessionIds = reservations
      .map((row) => row.checkoutSessionId)
      .filter((id): id is string => Boolean(id));
    if (!checkoutSessionIds.length) return [];
    return this.prisma.billingPayment.findMany({
      where: { checkoutSessionId: { in: checkoutSessionIds } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        tenantId: true,
        checkoutSessionId: true,
        provider: true,
        gatewayPaymentId: true,
        status: true,
        amountCents: true,
        currency: true,
        paidAt: true,
        refundedAt: true,
        createdAt: true,
        updatedAt: true,
        metadata: true,
      },
    });
  }

  getProductionConfiguration() {
    const required = [
      'BILLING_DEFAULT_PROVIDER',
      'BILLING_MODE',
      'BILLING_CHECKOUT_ENABLED',
      'BILLING_WEBHOOK_ENABLED',
      'BILLING_EXTERNAL_REFERENCE_SECRET',
      'MERCADO_PAGO_ACCESS_TOKEN',
      'MERCADO_PAGO_WEBHOOK_SECRET',
      'MERCADO_PAGO_COLLECTOR_ID',
    ];
    const normalPlans = Object.entries(NORMAL_PLAN_ID_ENVS).map(([planSlug, env]) => ({
      planSlug,
      env,
      configured: Boolean(process.env[env]?.trim()),
      paymentLinkUrl: NORMAL_PAYMENT_LINKS[planSlug as keyof typeof NORMAL_PAYMENT_LINKS],
    }));
    const promotionalPlans = PROMOTION_OFFERS.map((offer) => ({
      planSlug: offer.planSlug,
      periodMonths: offer.periodMonths,
      totalPriceCents: offer.totalPriceCents,
      paymentLinkUrl: offer.paymentLinkUrl,
      env: offer.gatewayPlanEnv,
      configured: Boolean(process.env[offer.gatewayPlanEnv]?.trim()),
    }));
    return {
      required: required.map((env) => ({
        env,
        configured: Boolean(process.env[env]?.trim()),
      })),
      normalPlans,
      promotionalPlans,
      webhookPath: '/api/billing/webhooks/mercado-pago',
    };
  }

  validateProductionConfiguration() {
    const config = this.getProductionConfiguration();
    const missing = [
      ...config.required.filter((item) => !item.configured).map((item) => item.env),
      ...config.normalPlans.filter((item) => !item.configured).map((item) => item.env),
      ...config.promotionalPlans.filter((item) => !item.configured).map((item) => item.env),
    ];
    return { ok: missing.length === 0, missing, configuration: config };
  }

  async activate(slug: string, validateProduction = false) {
    if (validateProduction) {
      const validation = this.validateProductionConfiguration();
      if (!validation.ok) {
        throw new ConflictException(
          `Configuração de produção incompleta: ${validation.missing.join(', ')}`,
        );
      }
    }
    const campaign = await this.findCampaign(slug);
    if (campaign.status === PromotionCampaignStatus.EXHAUSTED) {
      throw new ConflictException('Campanha esgotada não pode ser reativada.');
    }
    return this.prisma.promotionCampaign.update({
      where: { id: campaign.id },
      data: {
        status: PromotionCampaignStatus.ACTIVE,
        closedAt: null,
        closeReason: null,
        startsAt: campaign.startsAt ?? new Date(),
      },
    });
  }

  async close(slug: string, reason = 'MANUAL') {
    const campaign = await this.findCampaign(slug);
    return this.prisma.promotionCampaign.update({
      where: { id: campaign.id },
      data: {
        status: PromotionCampaignStatus.CLOSED,
        closedAt: new Date(),
        closeReason: reason.slice(0, 120),
      },
    });
  }

  private async setPromotionalTrial(
    tx: Prisma.TransactionClient,
    tenantId: string,
    trialDays: number,
  ) {
    const startedAt = new Date();
    await tx.subscription.updateMany({
      where: { tenantId, status: 'trialing' },
      data: {
        trialStartedAt: startedAt,
        trialEndsAt: new Date(startedAt.getTime() + trialDays * 86_400_000),
        version: { increment: 1 },
      },
    });
  }

  private async expireReservations(campaignId: string, now = new Date()) {
    const expired = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.promotionReservation.updateMany({
        where: {
          campaignId,
          status: PromotionReservationStatus.RESERVED,
          expiresAt: { lte: now },
        },
        data: {
          status: PromotionReservationStatus.EXPIRED,
          releasedAt: now,
          releaseReason: 'RESERVATION_EXPIRED',
        },
      });
      if (updated.count > 0) {
        await tx.promotionCampaign.updateMany({
          where: {
            id: campaignId,
            reservedCount: { gte: updated.count },
          },
          data: { reservedCount: { decrement: updated.count } },
        });
      }
      return updated.count;
    });
    return expired;
  }

  private async findCampaign(slug: string): Promise<CampaignSnapshot> {
    const normalized = slug.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(normalized)) {
      throw new NotFoundException('Campanha promocional inválida.');
    }
    const campaign = await this.prisma.promotionCampaign.findUnique({
      where: { slug: normalized },
    });
    if (!campaign) throw new NotFoundException('Campanha promocional não encontrada.');
    return campaign;
  }

  private isOpen(campaign: CampaignSnapshot, now: Date) {
    return (
      campaign.status === PromotionCampaignStatus.ACTIVE &&
      (!campaign.startsAt || campaign.startsAt <= now) &&
      (!campaign.endsAt || campaign.endsAt > now) &&
      campaign.convertedCount < campaign.maxConversions
    );
  }

  private formatReservation(
    reservation: {
      id: string;
      campaignId: string;
      status: PromotionReservationStatus;
      expiresAt: Date;
      convertedAt: Date | null;
    },
    campaign: CampaignSnapshot,
  ) {
    return {
      reservationId: reservation.id,
      campaignSlug: campaign.slug,
      status: reservation.status,
      trialDays: campaign.trialDays,
      expiresAt: reservation.expiresAt,
      convertedAt: reservation.convertedAt,
    };
  }
}
