import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { isSuperAdmin } from '../auth/super-admin.util';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { TenantAccessService } from '../tenancy/tenant-access.service';
import { toTenantSummary } from '../tenancy/tenant.utils';

type CreateTenantUserInput = {
  email?: string;
  name?: string;
  password?: string;
  role?: Role;
  tenantId?: string;
  branchId?: string;
};

const TENANT_MANAGED_ROLES: Role[] = [
  Role.Admin,
  Role.Vendedor,
  Role.Comprador,
];

function isConflictError(message: string): boolean {
  const normalizedMessage = message.toLowerCase();

  return (
    normalizedMessage.includes('already registered') ||
    normalizedMessage.includes('already exists') ||
    normalizedMessage.includes('duplicate') ||
    normalizedMessage.includes('unique')
  );
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly tenantAccess: TenantAccessService,
  ) {}

  async list(currentUser?: Express.AuthenticatedUser) {
    const user = this.tenantAccess.requireUser(currentUser);
    const tenantId = isSuperAdmin(user) ? null : this.tenantAccess.requireTenantId(user);

    const users = await this.prisma.userProfile.findMany({
      where: tenantId
        ? {
            memberships: {
              some: { tenantId },
            },
          }
        : undefined,
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        memberships: {
          where: tenantId ? { tenantId } : undefined,
          take: 1,
          select: {
            role: true,
            tenantId: true,
            branchId: true,
            tenant: {
              select: {
                id: true,
                name: true,
                slug: true,
                systemType: true,
              },
            },
            branch: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      ok: true,
      users: users.map((profile) => {
        const membership = profile.memberships[0];

        return {
          id: profile.id,
          email: profile.email,
          name: profile.name,
          role: membership?.role ?? null,
          tenantId: membership?.tenantId ?? null,
          branchId: membership?.branchId ?? null,
          createdAt: profile.createdAt,
          tenant: toTenantSummary(membership?.tenant),
          branch: membership?.branch ?? null,
        };
      }),
    };
  }

  async create(
    currentUser: Express.AuthenticatedUser | undefined,
    input: CreateTenantUserInput,
  ) {
    const user = this.tenantAccess.requireUser(currentUser);
    const email = this.normalizeEmail(input.email);
    const name = this.normalizeName(input.name ?? input.email);
    const password = this.normalizePassword(input.password);
    const role = this.parseManagedRole(input.role);
    const tenant = await this.tenantAccess.resolveTenantForOperation(
      user,
      input.tenantId,
    );

    if (!tenant) {
      throw new BadRequestException('tenantId is required to create a tenant user.');
    }
    const branch = await this.resolveBranch(tenant.id, input.branchId);
    const accessNameNormalized = this.normalizeAccessName(name);

    const existingProfile = await this.prisma.userProfile.findFirst({
      where: {
        OR: [{ email }, { accessNameNormalized }],
      },
      select: { id: true },
    });

    if (existingProfile) {
      throw new ConflictException('email or name is already registered');
    }

    const { data, error } = await this.supabase.admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

    if (error) {
      if (isConflictError(error.message)) {
        throw new ConflictException(error.message);
      }

      throw new BadRequestException(error.message);
    }

    const authUser = data.user;

    if (!authUser) {
      throw new InternalServerErrorException(
        'Supabase did not return the created user.',
      );
    }

    try {
      const profile = await this.prisma.userProfile.create({
        data: {
          id: authUser.id,
          supabaseUserId: authUser.id,
          email: authUser.email ?? email,
          name,
          fullName: name,
          accessNameNormalized,
          tenantId: tenant.id,
          primaryTenantId: tenant.id,
          systemType: tenant.systemType,
          allowedSystemTypes: [tenant.systemType],
          isSuperAdmin: false,
          memberships: {
            create: {
              tenantId: tenant.id,
              branchId: branch?.id,
              role,
            },
          },
        },
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          memberships: {
            where: { tenantId: tenant.id },
            take: 1,
            select: {
              role: true,
              tenantId: true,
              branchId: true,
              tenant: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  systemType: true,
                },
              },
              branch: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
          },
        },
      });

      const membership = profile.memberships[0];

      return {
        ok: true,
        user: {
          id: profile.id,
          email: profile.email,
          name: profile.name,
          role: membership?.role ?? null,
          tenantId: membership?.tenantId ?? null,
          branchId: membership?.branchId ?? null,
          createdAt: profile.createdAt,
          tenant: toTenantSummary(membership?.tenant),
          branch: membership?.branch ?? null,
        },
      };
    } catch {
      await this.supabase.admin.auth.admin
        .deleteUser(authUser.id)
        .catch(() => undefined);

      throw new InternalServerErrorException(
        'User creation failed while creating the profile. The authentication user was rolled back.',
      );
    }
  }

  async updateRole(
    currentUser: Express.AuthenticatedUser | undefined,
    profileId: string,
    nextRole?: Role,
  ) {
    const user = this.tenantAccess.requireUser(currentUser);
    const role = this.parseManagedRole(nextRole, true);
    const profile = await this.tenantAccess.findAccessibleProfile(
      user,
      profileId,
    );

    if (profile.id === user.id) {
      throw new ForbiddenException('You cannot change your own role.');
    }

    const updatedMember = await this.prisma.tenantMember.update({
      where: {
        tenantId_userProfileId: {
          tenantId: this.tenantAccess.requireTenantId(user),
          userProfileId: profileId,
        },
      },
      data: { role },
      select: {
        role: true,
        tenantId: true,
        branchId: true,
        userProfile: {
          select: {
            id: true,
            email: true,
            name: true,
            createdAt: true,
          },
        },
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            systemType: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    return {
      ok: true,
      user: {
        id: updatedMember.userProfile.id,
        email: updatedMember.userProfile.email,
        name: updatedMember.userProfile.name,
        role: updatedMember.role,
        tenantId: updatedMember.tenantId,
        branchId: updatedMember.branchId,
        createdAt: updatedMember.userProfile.createdAt,
        tenant: toTenantSummary(updatedMember.tenant),
        branch: updatedMember.branch,
      },
    };
  }

  private async resolveBranch(tenantId: string, branchId?: string) {
    if (branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, tenantId },
        select: { id: true },
      });

      if (!branch) {
        throw new NotFoundException('Branch not found.');
      }

      return branch;
    }

    return this.prisma.branch.findFirst({
      where: { tenantId, isDefault: true },
      select: { id: true },
    });
  }

  private normalizeEmail(email?: string) {
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail) {
      throw new BadRequestException('email and password are required');
    }

    return normalizedEmail;
  }

  private normalizePassword(password?: string) {
    if (!password) {
      throw new BadRequestException('email and password are required');
    }

    if (password.length < 6) {
      throw new BadRequestException(
        'password must be at least 6 characters',
      );
    }

    return password;
  }

  private normalizeName(name?: string) {
    const normalizedName = name?.trim();

    if (!normalizedName) {
      throw new BadRequestException('name is required');
    }

    return normalizedName;
  }

  private normalizeAccessName(name: string) {
    return name.trim().toLowerCase();
  }

  private parseManagedRole(role?: Role, required = false): Role {
    if (!role) {
      if (required) {
        throw new BadRequestException('role is required');
      }

      return Role.Comprador;
    }

    if (!TENANT_MANAGED_ROLES.includes(role)) {
      throw new BadRequestException(
        `role must be one of: ${TENANT_MANAGED_ROLES.join(', ')}`,
      );
    }

    return role;
  }
}
