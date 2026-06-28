import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  Prisma,
  Role,
  SubscriptionStatus,
  SystemMode,
  SystemType,
} from '@prisma/client';
import { canAccessDev } from '../auth/super-admin.util';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateMeDto } from './dto/update-me.dto';

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async getMe(user?: Express.AuthenticatedUser) {
    if (!user) {
      throw new UnauthorizedException('Sessao expirada ou invalida.');
    }

    const profile = await this.prisma.userProfile.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        fullName: true,
        name: true,
        email: true,
        role: true,
        systemType: true,
        allowedSystemTypes: true,
        isSuperAdmin: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!profile) {
      throw new NotFoundException('Perfil nao encontrado.');
    }

    return {
      ok: true,
      profile: {
        ...profile,
        fullName: profile.fullName ?? profile.name,
      },
    };
  }

  async updateMe(
    user: Express.AuthenticatedUser | undefined,
    dto: UpdateMeDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    if (!user) {
      throw new UnauthorizedException('Sessao expirada ou invalida.');
    }

    await this.tenantContext.resolve(user, {
      selectedBranchId,
      writable: true,
      allowDevSupport: this.isSupport(devContextMode),
    });

    const fullName = this.cleanRequired(dto.fullName, 'Nome completo');
    await this.prisma.userProfile.update({
      where: { id: user.id },
      data: { fullName, name: fullName },
    });

    return this.getMe(user);
  }

  async getCompany(
    user?: Express.AuthenticatedUser,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(
      user,
      selectedBranchId,
      devContextMode,
      false,
    );
    const tenant = await this.findTenant(context.tenantId);
    const subscription = await this.findEffectiveSubscription(context.tenantId);

    return {
      ok: true,
      mode: tenant.mode,
      systemType: tenant.systemType,
      company: {
        empresa: tenant.name,
        cnpj: tenant.cnpj,
        email: tenant.contactEmail,
        contato: tenant.contactPhone,
      },
      currentPlan: subscription?.plan
        ? this.formatPlan(subscription.plan)
        : tenant.currentPlan
          ? this.formatPlan(tenant.currentPlan)
          : null,
      subscription: this.formatSubscription(subscription),
    };
  }

  async updateCompany(
    user: Express.AuthenticatedUser | undefined,
    dto: UpdateCompanyDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(
      user,
      selectedBranchId,
      devContextMode,
      true,
      [Role.Admin],
    );
    const tenant = await this.findTenant(context.tenantId);
    const data: Prisma.TenantUpdateInput = {};

    if (dto.empresa !== undefined) {
      data.name = this.cleanRequired(dto.empresa, 'Nome da empresa');
    }
    if (dto.cnpj !== undefined) {
      const cnpj = this.normalizeOptionalCnpj(dto.cnpj);
      await this.assertCnpjUnique(cnpj, tenant.id);
      data.cnpj = cnpj;
    }
    if (dto.email !== undefined) {
      data.contactEmail = this.cleanNullable(dto.email)?.toLowerCase() ?? null;
    }
    if (dto.contato !== undefined) {
      data.contactPhone = this.normalizeOptionalPhone(dto.contato);
    }

    await this.prisma.tenant.update({
      where: { id: tenant.id },
      data,
    });

    return this.getCompany(user, selectedBranchId, devContextMode);
  }

  async listPlans() {
    const plans = await this.prisma.plan.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }],
    });

    return {
      ok: true,
      checkoutRequired: true,
      plans: plans.map((plan) => this.formatPlan(plan)),
    };
  }

  async getSubscription(
    user?: Express.AuthenticatedUser,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(
      user,
      selectedBranchId,
      devContextMode,
      false,
    );
    const tenant = await this.findTenant(context.tenantId);
    const subscription = await this.findEffectiveSubscription(context.tenantId);

    return {
      ok: true,
      subscription: this.formatSubscription(subscription),
      currentPlan: subscription?.plan
        ? this.formatPlan(subscription.plan)
        : tenant.currentPlan
          ? this.formatPlan(tenant.currentPlan)
          : null,
      billingConfigured: false,
      checkoutAvailable: false,
    };
  }

  async updatePlan(
    user: Express.AuthenticatedUser | undefined,
    planSlug: string,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    await this.resolveContext(
      user,
      selectedBranchId,
      devContextMode,
      true,
      [Role.Admin],
    );
    const plan = await this.prisma.plan.findUnique({ where: { slug: planSlug } });

    if (!plan || !plan.isActive) {
      throw new NotFoundException('Plano nao encontrado.');
    }

    throw new ConflictException({
      code: 'BILLING_CHECKOUT_REQUIRED',
      message:
        'A alteracao de plano exige checkout e confirmacao de pagamento. Nenhum plano foi alterado.',
      requestedPlan: this.formatPlan(plan),
    });
  }

  async getMode(
    user?: Express.AuthenticatedUser,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(
      user,
      selectedBranchId,
      devContextMode,
      false,
    );
    const tenant = await this.findTenant(context.tenantId);

    return {
      ok: true,
      mode: tenant.mode,
      systemType: tenant.systemType,
    };
  }

  async updateMode(
    user: Express.AuthenticatedUser | undefined,
    mode: SystemMode,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    if (!canAccessDev(user)) {
      throw new UnauthorizedException('Acesso restrito ao Dev SuperAdmin.');
    }

    const context = await this.resolveContext(
      user,
      selectedBranchId,
      devContextMode,
      false,
    );
    const tenant = await this.findTenant(context.tenantId);

    if (mode === SystemMode.petshop && tenant.systemType !== SystemType.petshop) {
      throw new BadRequestException(
        'Modo Pet Shop exige tenant com systemType petshop.',
      );
    }
    if (mode === SystemMode.padrao && tenant.systemType !== SystemType.padrao) {
      throw new BadRequestException(
        'Modo padrao exige tenant com systemType padrao.',
      );
    }

    const updatedTenant = await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: { mode },
      select: { mode: true, systemType: true },
    });

    return { ok: true, ...updatedTenant };
  }

  private resolveContext(
    user: Express.AuthenticatedUser | undefined,
    selectedBranchId: string | undefined,
    devContextMode: string | undefined,
    writable: boolean,
    allowedRoles?: Role[],
  ) {
    return this.tenantContext.resolve(user, {
      selectedBranchId,
      writable,
      allowedRoles,
      allowDevSupport: this.isSupport(devContextMode),
    });
  }

  private async findTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { currentPlan: true },
    });

    if (!tenant) {
      throw new UnauthorizedException('Tenant/empresa nao encontrado.');
    }

    return tenant;
  }

  private findEffectiveSubscription(tenantId: string) {
    const now = new Date();
    return this.prisma.subscription.findFirst({
      where: {
        tenantId,
        OR: [
          {
            status: SubscriptionStatus.trialing,
            trialEndsAt: { gt: now },
          },
          {
            status: SubscriptionStatus.active,
            OR: [
              { currentPeriodEndsAt: null },
              { currentPeriodEndsAt: { gt: now } },
            ],
          },
          { graceEndsAt: { gt: now } },
        ],
      },
      include: { plan: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async assertCnpjUnique(cnpj: string | null, tenantId: string) {
    if (!cnpj) {
      return;
    }

    const candidates = await this.prisma.tenant.findMany({
      where: { id: { not: tenantId }, cnpj: { not: null } },
      select: { id: true, cnpj: true },
    });
    const duplicate = candidates.some(
      (candidate) => this.onlyDigits(candidate.cnpj) === cnpj,
    );

    if (duplicate) {
      throw new ConflictException('CNPJ ja vinculado a outra empresa.');
    }
  }

  private normalizeOptionalCnpj(value?: string | null) {
    const cnpj = this.onlyDigits(value);

    if (!cnpj) {
      return null;
    }
    if (!this.isValidCnpj(cnpj)) {
      throw new BadRequestException('CNPJ invalido.');
    }

    return cnpj;
  }

  private normalizeOptionalPhone(value?: string | null) {
    const phone = this.onlyDigits(value);

    if (!phone) {
      return null;
    }
    if (phone.length < 10 || phone.length > 15) {
      throw new BadRequestException('Telefone invalido.');
    }

    return phone;
  }

  private isValidCnpj(cnpj: string) {
    if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) {
      return false;
    }

    const calculateDigit = (length: number) => {
      const weights =
        length === 12
          ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
          : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const sum = weights.reduce(
        (total, weight, index) => total + Number(cnpj[index]) * weight,
        0,
      );
      const remainder = sum % 11;
      return remainder < 2 ? 0 : 11 - remainder;
    };

    return (
      calculateDigit(12) === Number(cnpj[12]) &&
      calculateDigit(13) === Number(cnpj[13])
    );
  }

  private cleanNullable(value?: string | null) {
    const cleaned = value?.replace(/\s+/g, ' ').trim();
    return cleaned || null;
  }

  private cleanRequired(value: string, field: string) {
    const cleaned = this.cleanNullable(value);

    if (!cleaned || cleaned.length < 2) {
      throw new BadRequestException(`${field} deve ter ao menos 2 caracteres.`);
    }

    return cleaned;
  }

  private onlyDigits(value?: string | null) {
    return String(value ?? '').replace(/\D+/g, '');
  }

  private isSupport(value?: string) {
    return value?.trim().toLowerCase() === 'support';
  }

  private formatPlan(plan: {
    id: string;
    name: string;
    slug: string;
    priceCents: number;
    description: string | null;
    currency?: string;
    interval?: unknown;
  }) {
    return {
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      priceCents: plan.priceCents,
      price: plan.priceCents / 100,
      description: plan.description,
      currency: plan.currency ?? 'BRL',
      interval: plan.interval ?? null,
    };
  }

  private formatSubscription(subscription: any | null) {
    if (!subscription) {
      return null;
    }

    return {
      id: subscription.id,
      status: subscription.status,
      provider: subscription.gatewayProvider,
      currentPeriodStart: subscription.currentPeriodStartedAt,
      currentPeriodEnd: subscription.currentPeriodEndsAt,
      trialStartedAt: subscription.trialStartedAt,
      trialEndsAt: subscription.trialEndsAt,
      graceEndsAt: subscription.graceEndsAt,
      canceledAt: subscription.canceledAt,
      plan: subscription.plan ? this.formatPlan(subscription.plan) : null,
    };
  }
}
