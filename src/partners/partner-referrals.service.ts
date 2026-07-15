import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  PartnerPaymentSource,
  PartnerPaymentStatus,
  PartnerReferralStatus,
  Prisma,
} from '@prisma/client';
import { canAccessDev } from '../auth/super-admin.util';
import { PrismaService } from '../prisma/prisma.service';
import { ReferralQueryDto } from './dto/referral-query.dto';
import { UpdateReferralPaymentDto } from './dto/update-referral-payment.dto';
import { UpdateReferralSeenDto } from './dto/update-referral-seen.dto';

@Injectable()
export class PartnerReferralsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    user: AuthenticatedUser | undefined,
    partnerId: string,
    query: ReferralQueryDto,
  ) {
    this.assertDev(user);
    await this.assertPartner(partnerId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.replace(/\s+/g, ' ').trim();
    const where: Prisma.PartnerReferralWhereInput = {
      partnerId,
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
      ...(query.seen === true
        ? { seenAt: { not: null } }
        : query.seen === false
          ? { seenAt: null }
          : {}),
      ...(search
        ? {
            OR: [
              {
                referredProfile: {
                  email: { contains: search, mode: 'insensitive' },
                },
              },
              {
                referredTenant: {
                  name: { contains: search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.partnerReferral.count({ where }),
      this.prisma.partnerReferral.findMany({
        where,
        orderBy: [{ registeredAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: this.referralSelect(),
      }),
    ]);
    return {
      items: items.map((item) => this.formatReferral(item)),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updateSeen(
    user: AuthenticatedUser | undefined,
    partnerId: string,
    referralId: string,
    dto: UpdateReferralSeenDto,
  ) {
    this.assertDev(user);
    const current = await this.findScopedReferral(partnerId, referralId);
    const newSeenAt = dto.seen ? new Date() : null;
    const referral = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.partnerReferral.update({
        where: { id: current.id },
        data: {
          seenAt: newSeenAt,
          seenById: dto.seen ? user!.id : null,
        },
        select: this.referralSelect(),
      });
      await tx.partnerReferralSeenEvent.create({
        data: {
          referralId: current.id,
          previousSeenAt: current.seenAt,
          newSeenAt,
          changedById: user!.id,
        },
      });
      return updated;
    });
    return { referral: this.formatReferral(referral) };
  }

  async updatePayment(
    user: AuthenticatedUser | undefined,
    partnerId: string,
    referralId: string,
    dto: UpdateReferralPaymentDto,
  ) {
    this.assertDev(user);
    const current = await this.findScopedReferral(partnerId, referralId);
    const convertedAt =
      dto.paymentStatus === PartnerPaymentStatus.PAID
        ? current.convertedAt ?? new Date()
        : current.convertedAt;
    const status =
      dto.paymentStatus === PartnerPaymentStatus.PAID
        ? PartnerReferralStatus.CONVERTED
        : current.status === PartnerReferralStatus.CONVERTED
          ? PartnerReferralStatus.REGISTERED
          : current.status;
    const referral = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.partnerReferral.update({
        where: { id: current.id },
        data: { paymentStatus: dto.paymentStatus, convertedAt, status },
        select: this.referralSelect(),
      });
      await tx.partnerReferralPaymentEvent.create({
        data: {
          referralId: current.id,
          previousStatus: current.paymentStatus,
          newStatus: dto.paymentStatus,
          source: PartnerPaymentSource.MANUAL,
          changedById: user!.id,
          reason: dto.reason?.trim() || null,
        },
      });
      return updated;
    });
    return { referral: this.formatReferral(referral) };
  }

  private async assertPartner(partnerId: string) {
    const partner = await this.prisma.partner.findFirst({
      where: { id: partnerId, deletedAt: null },
      select: { id: true },
    });
    if (!partner) throw new NotFoundException('Parceiro nao encontrado.');
  }

  private async findScopedReferral(partnerId: string, referralId: string) {
    const referral = await this.prisma.partnerReferral.findFirst({
      where: { id: referralId, partnerId, partner: { deletedAt: null } },
      select: {
        id: true,
        seenAt: true,
        convertedAt: true,
        status: true,
        paymentStatus: true,
      },
    });
    if (!referral) throw new NotFoundException('Indicacao nao encontrada.');
    return referral;
  }

  private referralSelect() {
    return {
      id: true,
      systemType: true,
      status: true,
      paymentStatus: true,
      seenAt: true,
      registeredAt: true,
      convertedAt: true,
      referredProfile: { select: { email: true } },
      referredTenant: { select: { id: true, name: true } },
      referredBranch: { select: { id: true, name: true } },
    } satisfies Prisma.PartnerReferralSelect;
  }

  private formatReferral(item: any) {
    return {
      id: item.id,
      email: item.referredProfile.email,
      companyName: item.referredTenant.name,
      referredTenantId: item.referredTenant.id,
      referredBranchId: item.referredBranch.id,
      branchName: item.referredBranch.name,
      registeredAt: item.registeredAt,
      systemType: item.systemType,
      status: item.status,
      paymentStatus: item.paymentStatus,
      seen: Boolean(item.seenAt),
      seenAt: item.seenAt,
      convertedAt: item.convertedAt,
    };
  }

  private assertDev(user?: AuthenticatedUser) {
    if (!canAccessDev(user)) {
      throw new ForbiddenException('Acesso restrito ao Dev SuperAdmin.');
    }
  }
}
