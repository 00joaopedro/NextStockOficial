import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantAccessService } from '../tenancy/tenant-access.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
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
    private readonly tenantContext: TenantContextService,
  ) {}

  async list(currentUser?: Express.AuthenticatedUser, selectedBranchId?: string) {
    const context = await this.tenantContext.resolve(currentUser, {
      selectedBranchId,
      allowedRoles: [Role.Admin],
    });

    return {
      ok: true,
      tenants: [await this.formatTenantWithMemberCount(context.tenantId)],
    };
  }

  async getCurrent(currentUser?: Express.AuthenticatedUser, selectedBranchId?: string) {
    const context = await this.tenantContext.resolve(currentUser, { selectedBranchId });

    return {
      ok: true,
      tenant: await this.formatTenantWithMemberCount(context.tenantId),
    };
  }

  async updateCurrent(
    currentUser: Express.AuthenticatedUser | undefined,
    input: UpdateCurrentTenantInput,
    selectedBranchId?: string,
  ) {
    const context = await this.tenantContext.resolve(currentUser, {
      selectedBranchId,
      writable: true,
      allowedRoles: [Role.Admin],
    });
    const currentTenant = await this.tenantAccess.findTenantOrThrow(context.tenantId);

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
