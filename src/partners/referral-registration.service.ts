import { Injectable } from '@nestjs/common';
import { PartnerLinkEventType, PartnerLinkStatus, Prisma, SystemType } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export type ValidReferral = {
  partnerId: string;
  systemType: SystemType;
};

@Injectable()
export class ReferralRegistrationService {
  constructor(private readonly prisma: PrismaService) {}

  hashCode(code: string) {
    return createHash('sha256').update(code).digest('hex');
  }

  normalizeCode(code?: string | null) {
    const normalized = code?.trim();
    return normalized && /^[A-Za-z0-9_-]{32,128}$/.test(normalized)
      ? normalized
      : null;
  }

  async resolveActive(code?: string | null): Promise<ValidReferral | null> {
    const normalized = this.normalizeCode(code);
    if (!normalized) return null;

    const partner = await this.prisma.partner.findFirst({
      where: {
        referralCodeHash: this.hashCode(normalized),
        referralCode: normalized,
        linkStatus: PartnerLinkStatus.ACTIVE,
        deletedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true, systemType: true },
    });

    return partner ? { partnerId: partner.id, systemType: partner.systemType } : null;
  }

  async recordRejected(code?: string | null) {
    const normalized = this.normalizeCode(code);
    if (!normalized) return;

    const partner = await this.prisma.partner.findFirst({
      where: { referralCodeHash: this.hashCode(normalized) },
      select: { id: true },
    });
    if (!partner) return;

    await this.prisma.partnerLinkEvent.create({
      data: { partnerId: partner.id, eventType: PartnerLinkEventType.REJECTED },
    });
  }

  createReferral(
    tx: Prisma.TransactionClient,
    referral: ValidReferral,
    data: {
      profileId: string;
      tenantId: string;
      branchId: string;
      metadata?: Prisma.InputJsonValue;
    },
  ) {
    return Promise.all([
      tx.partnerReferral.create({
        data: {
          partnerId: referral.partnerId,
          referredProfileId: data.profileId,
          referredTenantId: data.tenantId,
          referredBranchId: data.branchId,
          systemType: referral.systemType,
          attributionMetadata: data.metadata,
        },
      }),
      tx.partner.update({
        where: { id: referral.partnerId },
        data: { lastUsedAt: new Date() },
      }),
      tx.partnerLinkEvent.create({
        data: {
          partnerId: referral.partnerId,
          eventType: PartnerLinkEventType.USED,
        },
      }),
    ]);
  }
}
