import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isSuperAdmin } from '../auth/super-admin.util';
import { TenantAccessService } from '../tenancy/tenant-access.service';
import { generateUniqueTenantSlug } from '../tenancy/tenant.utils';

type UpdateCurrentTenantInput = {
  name?: string;
  slug?: string;
};

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantAccess: TenantAccessService,
  ) {}

  async list(currentUser?: Express.AuthenticatedUser) {
    const user = this.tenantAccess.requireUser(currentUser);

    if (isSuperAdmin(user)) {
      const tenants = await this.prisma.tenant.findMany({
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      });

      return {
        ok: true,
        tenants: await Promise.all(
          tenants.map((tenant) => this.formatTenantWithMemberCount(tenant.id)),
        ),
      };
    }

    return {
      ok: true,
      tenants: [await this.formatTenantWithMemberCount(user.tenantId)],
    };
  }

  async getCurrent(currentUser?: Express.AuthenticatedUser) {
    const user = this.tenantAccess.requireUser(currentUser);

    if (isSuperAdmin(user) && !user.tenantId && !user.primaryTenantId) {
      return {
        ok: true,
        tenant: null,
        isSuperAdmin: true,
      };
    }

    return {
      ok: true,
      tenant: await this.formatTenantWithMemberCount(user.tenantId),
    };
  }

  async updateCurrent(
    currentUser: Express.AuthenticatedUser | undefined,
    input: UpdateCurrentTenantInput,
  ) {
    const user = this.tenantAccess.requireUser(currentUser);
    const currentTenant = await this.tenantAccess.getCurrentTenant(user);

    if (!currentTenant) {
      throw new UnauthorizedException(
        'Authenticated user is not linked to a tenant.',
      );
    }

    const data: { name?: string; slug?: string } = {};

    if (typeof input.name === 'string') {
      const name = input.name.trim();

      if (!name) {
        throw new BadRequestException('name cannot be empty');
      }

      data.name = name;
    }

    if (typeof input.slug === 'string') {
      const slugInput = input.slug.trim();

      if (!slugInput) {
        throw new BadRequestException('slug cannot be empty');
      }

      data.slug = await this.buildUniqueTenantSlug(
        slugInput,
        currentTenant.id,
      );
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException(
        'Provide at least one field to update.',
      );
    }

    await this.prisma.tenant.update({
      where: { id: currentTenant.id },
      data,
    });

    return {
      ok: true,
      tenant: await this.formatTenantWithMemberCount(currentTenant.id),
    };
  }

  private async formatTenantWithMemberCount(tenantId: string | null) {
    if (!tenantId) {
      throw new UnauthorizedException(
        'Authenticated user is not linked to a tenant.',
      );
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        systemType: true,
        createdAt: true,
        _count: {
          select: {
            members: true,
            branches: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new UnauthorizedException('Tenant not found.');
    }

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      systemType: tenant.systemType,
      createdAt: tenant.createdAt,
      membersCount: tenant._count.members,
      branchesCount: tenant._count.branches,
    };
  }

  private async buildUniqueTenantSlug(rawValue: string, ignoreId?: string) {
    return generateUniqueTenantSlug(rawValue, async (slug) => {
      const existing = await this.prisma.tenant.findUnique({
        where: { slug },
        select: { id: true },
      });

      if (!existing) {
        return false;
      }

      return existing.id !== ignoreId;
    });
  }
}
