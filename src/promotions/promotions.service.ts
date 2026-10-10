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

const DEFAULT_RESERVATION_TTL_MS = 30 * 60 * 1000;

type ReserveInput = {
  slug: string;
  tenantId: string;
  idempotencyKey?: string;
  partnerId?: string | null;
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
          return tx.promotionReservation.update({
            where: { id: existing.id },
            data: {
              partnerId: input.partnerId ?? existing.partnerId,
              idempotencyKey,
              status: PromotionReservationStatus.RESERVED,
              reservedAt: new Date(),
              expiresAt,
              convertedAt: null,
              releasedAt: null,
              releaseReason: null,
              metadata: {
                source: 'promotion',
                trialDays: campaign.trialDays,
              },
            },
          });
        }

        return tx.promotionReservation.create({
          data: {
            campaignId: campaign.id,
            tenantId: input.tenantId,
            partnerId: input.partnerId ?? null,
            idempotencyKey,
            expiresAt,
            metadata: {
              source: 'promotion',
              trialDays: campaign.trialDays,
            },
          },
        });
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

  async activate(slug: string) {
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
