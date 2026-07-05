import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { TenantAccessService } from '../tenancy/tenant-access.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { toTenantSummary } from '../tenancy/tenant.utils';
import { SessionsService } from '../sessions/sessions.service';

type CreateTenantUserInput = {
  email?: string;
  name?: string;
  password?: string;
  role?: Role;
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
    private readonly tenantContext: TenantContextService,
    @Optional() private readonly sessions?: SessionsService,
  ) {}

  async list(currentUser?: Express.AuthenticatedUser, selectedBranchId?: string) {
    const context = await this.tenantContext.resolve(currentUser, {
      selectedBranchId,
      requireBranch: true,
      allowedRoles: [Role.Admin],
    });

    const users = await this.prisma.userProfile.findMany({
      where: {
        memberships: {
          some: { tenantId: context.tenantId, branchId: context.branchId },
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        memberships: {
          where: { tenantId: context.tenantId, branchId: context.branchId },
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
    selectedBranchId?: string,
  ) {
    const context = await this.tenantContext.resolve(currentUser, {
      selectedBranchId,
      requireBranch: true,
      writable: true,
      allowedRoles: [Role.Admin],
    });
    const email = this.normalizeEmail(input.email);
    const name = this.normalizeName(input.name ?? input.email);
    const password = this.normalizePassword(input.password);
    const role = this.parseManagedRole(input.role);
    const tenant = await this.tenantAccess.findTenantOrThrow(context.tenantId);
    const branch = await this.resolveBranch(tenant.id, context.branchId ?? undefined);
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
        throw new ConflictException('E-mail ou nome ja cadastrado.');
      }

      throw new BadRequestException('Nao foi possivel criar o usuario.');
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
    selectedBranchId?: string,
  ) {
    const user = this.tenantAccess.requireUser(currentUser);
    const context = await this.tenantContext.resolve(user, {
      selectedBranchId,
      requireBranch: true,
      writable: true,
      allowedRoles: [Role.Admin],
    });
    const role = this.parseManagedRole(nextRole, true);
    const profile = await this.tenantAccess.findAccessibleProfile(
      user,
      profileId,
    );

    if (profile.id === user.id) {
      throw new ForbiddenException('You cannot change your own role.');
    }

    const targetMember = await this.prisma.tenantMember.findFirst({
      where: {
        tenantId: context.tenantId,
        branchId: context.branchId,
        userProfileId: profileId,
      },
      select: { id: true },
    });

    if (!targetMember) {
      throw new ForbiddenException('Usuario nao pertence a filial selecionada.');
    }

    const updatedMember = await this.prisma.tenantMember.update({
      where: { id: targetMember.id },
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

    await this.sessions?.revokeAllForProfile(profileId, 'role_changed');

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
        where: { id: branchId, tenantId, isActive: true },
        select: { id: true },
      });

      if (!branch) {
        throw new NotFoundException('Branch not found.');
      }

      return branch;
    }

    return this.prisma.branch.findFirst({
      where: { tenantId, isDefault: true, isActive: true },
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
