import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { canAccessDev, isSuperAdmin } from '../auth/super-admin.util';
import { toTenantSummary } from './tenant.utils';

type AuthUser = AuthenticatedUser;

@Injectable()
export class TenantAccessService {
  constructor(private readonly prisma: PrismaService) {}

  requireUser(user?: AuthUser): AuthUser {
    if (!user) {
      throw new UnauthorizedException('Authenticated user not found.');
    }

    return user;
  }

  requireTenantId(user: AuthUser): string {
    if (isSuperAdmin(user) && (user.tenantId || user.primaryTenantId)) {
      return user.tenantId ?? user.primaryTenantId!;
    }

    if (!user.tenantId) {
      throw new UnauthorizedException(
        'Authenticated user is not linked to a tenant.',
      );
    }

    return user.tenantId;
  }

  async findTenantOrThrow(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        systemType: true,
        createdAt: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found.');
    }

    return tenant;
  }

  async getCurrentTenant(userInput?: AuthUser) {
    const user = this.requireUser(userInput);

    if (isSuperAdmin(user) && !user.tenantId) {
      return null;
    }

    if (!user.tenantId) {
      throw new UnauthorizedException(
        'Authenticated user is not linked to a tenant.',
      );
    }

    return this.findTenantOrThrow(user.tenantId);
  }

  async resolveTenantForOperation(
    userInput?: AuthUser,
    requestedTenantId?: string | null,
  ) {
    const user = this.requireUser(userInput);

    if (canAccessDev(user)) {
      const tenantId = requestedTenantId ?? user.tenantId ?? user.primaryTenantId;

      if (!tenantId) {
        return null;
      }

      return this.findTenantOrThrow(tenantId);
    }

    const tenantId = this.requireTenantId(user);

    if (requestedTenantId && requestedTenantId !== tenantId) {
      throw new ForbiddenException(
        'You can only access data from your own tenant.',
      );
    }

    return this.findTenantOrThrow(tenantId);
  }

  async findAccessibleProfile(
    userInput: AuthUser | undefined,
    profileId: string,
  ) {
    const user = this.requireUser(userInput);
    const membershipWhere = canAccessDev(user)
      ? undefined
      : { tenantId: this.requireTenantId(user) };
    const profile = await this.prisma.userProfile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        memberships: {
          where: membershipWhere,
          take: 1,
          select: {
            role: true,
            tenantId: true,
            tenant: {
              select: {
                id: true,
                name: true,
                slug: true,
                systemType: true,
              },
            },
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('User profile not found.');
    }

    const membership = profile.memberships[0];

    if (canAccessDev(user)) {
      return {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        role: membership?.role ?? null,
        tenantId: membership?.tenantId ?? null,
        createdAt: profile.createdAt,
        tenant: toTenantSummary(membership?.tenant),
      };
    }

    if (!membership) {
      throw new ForbiddenException(
        'You can only access users from your own tenant.',
      );
    }

    return {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      role: membership.role,
      tenantId: membership.tenantId,
      createdAt: profile.createdAt,
      tenant: toTenantSummary(membership.tenant),
    };
  }
}
