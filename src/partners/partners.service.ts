import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PartnerLinkEventType,
  PartnerLinkStatus,
  Prisma,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { canAccessDev } from '../auth/super-admin.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { PartnerQueryDto } from './dto/partner-query.dto';
import { UpdateLinkStatusDto } from './dto/update-link-status.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';

type AuditContext = {
  ip?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class PartnersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthenticatedUser | undefined, query: PartnerQueryDto) {
    this.assertDev(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = this.clean(query.search);
    const where: Prisma.PartnerWhereInput = {
      deletedAt: null,
      ...(query.linkStatus ? { linkStatus: query.linkStatus } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
              { bankNumber: { contains: search, mode: 'insensitive' } },
              { referralCodePrefix: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, items, activeLinks, totalReferredUsers, paidUsers] =
      await this.prisma.$transaction([
        this.prisma.partner.count({ where }),
        this.prisma.partner.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
          include: {
            _count: { select: { referrals: true } },
            referrals: {
              where: { paymentStatus: 'PAID' },
              select: { id: true },
            },
          },
        }),
        this.prisma.partner.count({
          where: { deletedAt: null, linkStatus: PartnerLinkStatus.ACTIVE },
        }),
        this.prisma.partnerReferral.count({
          where: { partner: { deletedAt: null } },
        }),
        this.prisma.partnerReferral.count({
          where: { partner: { deletedAt: null }, paymentStatus: 'PAID' },
        }),
      ]);

    return {
      items: items.map((partner) => this.formatPartner(partner)),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      metrics: {
        totalPartners: await this.prisma.partner.count({ where: { deletedAt: null } }),
        activeLinks,
        totalReferredUsers,
        paidUsers,
      },
    };
  }

  async findOne(user: AuthenticatedUser | undefined, id: string) {
    this.assertDev(user);
    const partner = await this.findActiveOrThrow(id);
    return { partner: this.formatPartner(partner) };
  }

  async create(
    user: AuthenticatedUser | undefined,
    dto: CreatePartnerDto,
    audit: AuditContext = {},
  ) {
    this.assertDev(user);
    const token = await this.generateUniqueToken();
    const partner = await this.prisma.$transaction(async (tx) => {
      const created = await tx.partner.create({
        data: {
          name: this.required(dto.name),
          phone: this.required(dto.phone),
          bankNumber: this.required(dto.bankNumber),
          referralCode: token,
          referralCodeHash: this.hash(token),
          referralCodePrefix: token.slice(0, 8),
          systemType: dto.systemType,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          createdById: user!.id,
          updatedById: user!.id,
        },
        include: { _count: { select: { referrals: true } } },
      });
      await this.createLinkEvent(
        tx,
        created.id,
        PartnerLinkEventType.GENERATED,
        user!.id,
        audit,
      );
      return created;
    });

    return { partner: this.formatPartner(partner) };
  }

  async update(
    user: AuthenticatedUser | undefined,
    id: string,
    dto: UpdatePartnerDto,
  ) {
    this.assertDev(user);
    const current = await this.findActiveOrThrow(id);
    const partner = await this.prisma.partner.update({
      where: { id: current.id },
      data: {
        ...(dto.name !== undefined ? { name: this.required(dto.name) } : {}),
        ...(dto.phone !== undefined ? { phone: this.required(dto.phone) } : {}),
        ...(dto.bankNumber !== undefined
          ? { bankNumber: this.required(dto.bankNumber) }
          : {}),
        updatedById: user!.id,
      },
      include: { _count: { select: { referrals: true } } },
    });
    return { partner: this.formatPartner(partner) };
  }

  async remove(
    user: AuthenticatedUser | undefined,
    id: string,
    audit: AuditContext = {},
  ) {
    this.assertDev(user);
    const current = await this.findActiveOrThrow(id);
    const partner = await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.partner.update({
        where: { id: current.id },
        data: {
          linkStatus: PartnerLinkStatus.REVOKED,
          deletedAt: new Date(),
          updatedById: user!.id,
        },
        include: { _count: { select: { referrals: true } } },
      });
      await this.createLinkEvent(
        tx,
        current.id,
        PartnerLinkEventType.DELETED,
        user!.id,
        audit,
      );
      return deleted;
    });
    return { partner: this.formatPartner(partner) };
  }

  async rotateLink(
    user: AuthenticatedUser | undefined,
    id: string,
    audit: AuditContext = {},
  ) {
    this.assertDev(user);
    const current = await this.findActiveOrThrow(id);
    const token = await this.generateUniqueToken();
    const partner = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.partner.update({
        where: { id: current.id },
        data: {
          referralCode: token,
          referralCodeHash: this.hash(token),
          referralCodePrefix: token.slice(0, 8),
          linkStatus: PartnerLinkStatus.ACTIVE,
          updatedById: user!.id,
        },
        include: { _count: { select: { referrals: true } } },
      });
      await this.createLinkEvent(
        tx,
        current.id,
        PartnerLinkEventType.ROTATED,
        user!.id,
        audit,
      );
      return updated;
    });
    return { partner: this.formatPartner(partner) };
  }

  async updateLinkStatus(
    user: AuthenticatedUser | undefined,
    id: string,
    dto: UpdateLinkStatusDto,
    audit: AuditContext = {},
  ) {
    this.assertDev(user);
    const current = await this.findActiveOrThrow(id);

    if (current.linkStatus === PartnerLinkStatus.REVOKED) {
      throw new ConflictException(
        'Link revogado nao pode ser reativado. Rotacione o link.',
      );
    }

    const eventType =
      dto.status === PartnerLinkStatus.ACTIVE
        ? PartnerLinkEventType.ACTIVATED
        : dto.status === PartnerLinkStatus.INACTIVE
          ? PartnerLinkEventType.DEACTIVATED
          : PartnerLinkEventType.DELETED;
    const partner = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.partner.update({
        where: { id: current.id },
        data: { linkStatus: dto.status, updatedById: user!.id },
        include: { _count: { select: { referrals: true } } },
      });
      await this.createLinkEvent(tx, current.id, eventType, user!.id, audit);
      return updated;
    });
    return { partner: this.formatPartner(partner) };
  }

  private assertDev(user?: AuthenticatedUser) {
    if (!canAccessDev(user)) {
      throw new ForbiddenException('Acesso restrito ao Dev SuperAdmin.');
    }
  }

  private async findActiveOrThrow(id: string) {
    const partner = await this.prisma.partner.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { referrals: true } } },
    });
    if (!partner) throw new NotFoundException('Parceiro nao encontrado.');
    return partner;
  }

  private async generateUniqueToken(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const token = randomBytes(32).toString('base64url');
      const exists = await this.prisma.partner.findFirst({
        where: {
          OR: [{ referralCode: token }, { referralCodeHash: this.hash(token) }],
        },
        select: { id: true },
      });
      if (!exists) return token;
    }
    throw new ConflictException('Nao foi possivel gerar um link unico.');
  }

  private createLinkEvent(
    tx: Prisma.TransactionClient,
    partnerId: string,
    eventType: PartnerLinkEventType,
    actorProfileId: string,
    audit: AuditContext,
  ) {
    return tx.partnerLinkEvent.create({
      data: {
        partnerId,
        eventType,
        actorProfileId,
        ipHash: this.optionalHash(audit.ip),
        userAgentHash: this.optionalHash(audit.userAgent),
      },
    });
  }

  private formatPartner(partner: any) {
    const referralCount = partner._count?.referrals ?? 0;
    const paidReferralCount = Array.isArray(partner.referrals)
      ? partner.referrals.length
      : undefined;
    return {
      id: partner.id,
      name: partner.name,
      phone: partner.phone,
      bankNumber: partner.bankNumber,
      sellerLink: this.buildSellerLink(partner.referralCode),
      linkStatus: partner.linkStatus,
      systemType: partner.systemType,
      expiresAt: partner.expiresAt,
      lastUsedAt: partner.lastUsedAt,
      referralCount,
      ...(paidReferralCount === undefined ? {} : { paidReferralCount }),
      createdAt: partner.createdAt,
      updatedAt: partner.updatedAt,
    };
  }

  private buildSellerLink(code: string) {
    const base = (
      process.env.NEXTSTOCK_PUBLIC_URL ||
      process.env.PUBLIC_APP_URL ||
      ''
    ).replace(/\/+$/, '');
    const path = `/index.html?ref=${encodeURIComponent(code)}`;
    return base ? `${base}${path}` : path;
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private optionalHash(value?: string | null) {
    return value ? this.hash(value.slice(0, 500)) : null;
  }

  private clean(value?: string) {
    return value?.replace(/\s+/g, ' ').trim() || undefined;
  }

  private required(value: string) {
    return value.replace(/\s+/g, ' ').trim();
  }
}
