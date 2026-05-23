import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, SystemMode, SystemType } from '@prisma/client';
import { isSuperAdmin } from '../auth/super-admin.util';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCompanyDto } from './dto/update-company.dto';

const DEMO_COMPANY = {
  nomeCompleto: 'Usuario de demonstracao',
  empresa: 'NextStock Demo',
  cnpj: '00.000.000/0000-00',
  email: 'demo@nextstock.local',
  contato: '(00) 00000-0000',
};

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getCompany(user?: Express.AuthenticatedUser) {
    if (isSuperAdmin(user) && !user?.tenantId) {
      return {
        ok: true,
        mode: SystemMode.padrao,
        isSuperAdmin: true,
        company: {
          nomeCompleto: user?.fullName ?? user?.name ?? 'Super Admin',
          empresa: 'NextStock',
          cnpj: null,
          email: user?.email ?? null,
          contato: null,
        },
        currentPlan: null,
      };
    }

    if (!user?.tenantId) {
      return {
        ok: true,
        mode: SystemMode.visualizacao,
        company: DEMO_COMPANY,
      };
    }

    const [tenant, profile] = await Promise.all([
      this.findTenant(user.tenantId),
      this.prisma.userProfile.findUnique({
        where: { id: user.id },
        select: { fullName: true, name: true, email: true },
      }),
    ]);

    return {
      ok: true,
      mode: tenant.mode,
      company: {
        nomeCompleto: profile?.fullName ?? profile?.name ?? user.name,
        empresa: tenant.name,
        cnpj: tenant.cnpj,
        email: tenant.contactEmail ?? profile?.email ?? user.email,
        contato: tenant.contactPhone,
      },
      currentPlan: tenant.currentPlan ? this.formatPlan(tenant.currentPlan) : null,
    };
  }

  async updateCompany(user: Express.AuthenticatedUser | undefined, dto: UpdateCompanyDto) {
    const tenant = await this.requireWritableTenant(user);

    const data: Prisma.TenantUpdateInput = {};

    if (dto.empresa !== undefined) data.name = this.cleanRequired(dto.empresa, 'empresa');
    if (dto.cnpj !== undefined) data.cnpj = this.clean(dto.cnpj);
    if (dto.email !== undefined) data.contactEmail = this.clean(dto.email);
    if (dto.contato !== undefined) data.contactPhone = this.clean(dto.contato);

    await this.prisma.$transaction([
      this.prisma.tenant.update({
        where: { id: tenant.id },
        data,
      }),
      ...(dto.nomeCompleto !== undefined
        ? [
            this.prisma.userProfile.update({
              where: { id: user!.id },
              data: {
                fullName: this.clean(dto.nomeCompleto),
                name: this.clean(dto.nomeCompleto) || user!.name,
              },
            }),
          ]
        : []),
    ]);

    return this.getCompany(user);
  }

  async listPlans() {
    const plans = await this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { priceCents: 'asc' },
    });

    return { ok: true, plans: plans.map(this.formatPlan) };
  }

  async updatePlan(user: Express.AuthenticatedUser | undefined, planSlug: string) {
    const tenant = await this.requireWritableTenant(user);
    const plan = await this.prisma.plan.findUnique({
      where: { slug: planSlug },
    });

    if (!plan || !plan.isActive) {
      throw new NotFoundException('Plan not found.');
    }

    const updatedTenant = await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: { currentPlanId: plan.id },
      include: { currentPlan: true },
    });

    return {
      ok: true,
      currentPlan: updatedTenant.currentPlan
        ? this.formatPlan(updatedTenant.currentPlan)
        : null,
    };
  }

  async getMode(user?: Express.AuthenticatedUser) {
    if (isSuperAdmin(user)) {
      return {
        ok: true,
        mode: SystemMode.padrao,
        systemType: SystemType.petshop,
        isSuperAdmin: true,
        allowedSystemTypes: [SystemType.padrao, SystemType.petshop],
      };
    }

    if (!user?.tenantId) {
      return {
        ok: true,
        mode: SystemMode.visualizacao,
        systemType: SystemType.padrao,
      };
    }

    const tenant = await this.findTenant(user.tenantId);

    return {
      ok: true,
      mode: tenant.mode,
      systemType: tenant.systemType,
    };
  }

  async updateMode(user: Express.AuthenticatedUser | undefined, mode: SystemMode) {
    const tenant = await this.requireWritableTenant(user);

    if (mode === SystemMode.petshop && tenant.systemType !== SystemType.petshop) {
      throw new BadRequestException('Pet Shop mode requires systemType petshop.');
    }

    const updatedTenant = await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: { mode },
      select: { mode: true, systemType: true },
    });

    return { ok: true, ...updatedTenant };
  }

  private async requireWritableTenant(user?: Express.AuthenticatedUser) {
    if (isSuperAdmin(user)) {
      const tenantId = user?.tenantId ?? user?.primaryTenantId;

      if (!tenantId) {
        throw new ForbiddenException('tenantId is required for superAdmin writes.');
      }

      return this.findTenant(tenantId);
    }

    if (!user?.tenantId) {
      throw new ForbiddenException('Modo visualizacao: alteracao bloqueada.');
    }

    const tenant = await this.findTenant(user.tenantId);

    if (tenant.mode === SystemMode.visualizacao) {
      throw new ForbiddenException('Modo visualizacao: alteracao bloqueada.');
    }

    return tenant;
  }

  private async findTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { currentPlan: true },
    });

    if (!tenant) {
      throw new UnauthorizedException('Tenant not found.');
    }

    return tenant;
  }

  private clean(value?: string | null) {
    return value?.trim() || null;
  }

  private cleanRequired(value: string, field: string) {
    const cleaned = value.trim();

    if (!cleaned) {
      throw new BadRequestException(`${field} cannot be empty.`);
    }

    return cleaned;
  }

  private formatPlan(plan: {
    id: string;
    name: string;
    slug: string;
    priceCents: number;
    description: string | null;
  }) {
    return {
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      priceCents: plan.priceCents,
      price: plan.priceCents / 100,
      description: plan.description,
    };
  }
}
