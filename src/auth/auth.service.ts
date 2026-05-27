import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  RequestTimeoutException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Role, SystemMode, SystemType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import {
  generateUniqueTenantSlug,
  toTenantSummary,
} from '../tenancy/tenant.utils';
import { isSuperAdmin, SUPER_ADMIN_SYSTEM_TYPES } from './super-admin.util';

type RegisterInput = {
  email?: string;
  name?: string;
  companyName?: string;
  password?: string;
  systemType?: string;
};

type LoginInput = {
  email?: string;
  password?: string;
};

type ForgotPasswordInput = {
  email?: string;
};

const DEFAULT_BRANCH_NAME = 'Matriz';
const DEFAULT_BRANCH_SLUG = 'matriz';
const DEV_TENANT_NAME = 'NextStock Dev';
const DEV_TENANT_SLUG = 'nextstock-dev';
const DEV_BRANCH_NAME = 'Matriz Dev';
const DEV_BRANCH_SLUG = 'matriz-dev';
const SUPABASE_AUTH_TIMEOUT_MS = 15000;

function normalizeAccessName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function isConflictError(message: string): boolean {
  const normalizedMessage = message.toLowerCase();

  return (
    normalizedMessage.includes('already registered') ||
    normalizedMessage.includes('already exists') ||
    normalizedMessage.includes('duplicate') ||
    normalizedMessage.includes('unique')
  );
}

type SupabaseAuthError = {
  message?: string;
  name?: string;
  status?: number;
  code?: string;
};

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new RequestTimeoutException(message));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly prisma: PrismaService,
  ) {}

  async register(input: RegisterInput) {
    const email = this.normalizeEmail(input.email);
    const name = this.normalizeName(input.name);
    const companyName = this.normalizeCompanyName(input.companyName);
    const password = this.normalizePassword(input.password);
    const systemType = this.normalizeSystemType(input.systemType);
    const tenantName = companyName;
    const tenantSlug = await this.buildUniqueTenantSlug(tenantName);
    const accessNameNormalized = normalizeAccessName(name);

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
      user_metadata: {
        name,
        full_name: name,
        companyName,
        systemType,
        role: Role.Admin,
        access_name_normalized: accessNameNormalized,
        allowed_system_types: [systemType],
        is_super_admin: false,
        isSuperAdmin: false,
      },
    });

    if (error) {
      if (isConflictError(error.message)) {
        throw new ConflictException(error.message);
      }

      throw this.buildSupabaseAuthException(error);
    }

    const authUser = data.user;

    if (!authUser) {
      throw new InternalServerErrorException(
        'Supabase did not return the created user.',
      );
    }

    let result!: {
      tenant: {
        id: string;
        name: string;
        slug: string;
        systemType: SystemType;
        createdAt: Date;
      };
      branch: {
        id: string;
        name: string;
        slug: string;
      };
      profile: {
        id: string;
        email: string;
        name: string;
        createdAt: Date;
      };
    };

    try {
      result = await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name: tenantName,
            slug: tenantSlug,
            systemType,
            mode:
              systemType === SystemType.petshop
                ? SystemMode.petshop
                : SystemMode.padrao,
          },
          select: {
            id: true,
            name: true,
            slug: true,
            systemType: true,
            createdAt: true,
          },
        });

        const branch = await tx.branch.create({
          data: {
            tenantId: tenant.id,
            name: DEFAULT_BRANCH_NAME,
            slug: DEFAULT_BRANCH_SLUG,
            isDefault: true,
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            slug: true,
          },
        });

        const profile = await tx.userProfile.upsert({
          where: { id: authUser.id },
          create: {
            id: authUser.id,
            supabaseUserId: authUser.id,
            email: authUser.email ?? email,
            name,
            fullName: name,
            tenantId: tenant.id,
            role: Role.Admin,
            systemType,
            allowedSystemTypes: [systemType],
            isSuperAdmin: false,
            accessNameNormalized,
            primaryTenantId: tenant.id,
          },
          update: {
            supabaseUserId: authUser.id,
            email: authUser.email ?? email,
            name,
            fullName: name,
            tenantId: tenant.id,
            role: Role.Admin,
            systemType,
            allowedSystemTypes: [systemType],
            isSuperAdmin: false,
            accessNameNormalized,
            primaryTenantId: tenant.id,
          },
          select: {
            id: true,
            email: true,
            name: true,
            createdAt: true,
          },
        });

        await tx.tenantMember.upsert({
          where: {
            tenantId_userProfileId: {
              tenantId: tenant.id,
              userProfileId: profile.id,
            },
          },
          update: {
            branchId: branch.id,
            role: Role.Admin,
          },
          create: {
            tenantId: tenant.id,
            userProfileId: profile.id,
            branchId: branch.id,
            role: Role.Admin,
          },
        });

        return { tenant, branch, profile };
      });
    } catch (error) {
      await this.supabase.admin.auth.admin
        .deleteUser(authUser.id)
        .catch(() => undefined);

      throw new InternalServerErrorException(
        error instanceof Error
          ? `User registration failed while creating tenant/profile: ${error.message}`
          : 'User registration failed while creating the tenant/profile. The authentication user was rolled back.',
      );
    }

    const accessToken = await this.signInAfterRegister(email, password);
    const user = this.formatAuthUser({
      ...result.profile,
      role: Role.Admin,
      tenant: result.tenant,
      branch: result.branch,
    });
    const selectedBranch = this.formatSelectedBranch(
      result.branch,
      result.tenant.id,
      result.tenant.systemType,
    );

    return {
      accessToken,
      payload: {
        message: 'Cadastro realizado com sucesso.',
        user,
        tenant: {
          id: result.tenant.id,
          name: result.tenant.name,
          systemType: result.tenant.systemType,
        },
        selectedBranch,
        redirectTo: 'produtos.html',
      },
    };
  }

  async login(input: LoginInput) {
    const email = this.normalizeEmail(input.email);
    const password = this.normalizePassword(input.password);

    const { data, error } = await withTimeout(
      this.supabase.anon.auth.signInWithPassword({
        email,
        password,
      }),
      SUPABASE_AUTH_TIMEOUT_MS,
      'Supabase Auth did not respond in time.',
    ).catch((error) => {
      if (error instanceof RequestTimeoutException) {
        throw error;
      }

      throw new ServiceUnavailableException(
        'Supabase Auth is temporarily unavailable.',
      );
    });

    if (error) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const accessToken = data.session?.access_token;

    if (!accessToken) {
      throw new InternalServerErrorException(
        'Supabase did not return an access token.',
      );
    }

    if (!data.user?.id) {
      throw new UnauthorizedException('Invalid Supabase session.');
    }

    const profile = await this.findOrCreateProfileForLogin({
      supabaseUserId: data.user.id,
      email,
      metadata: data.user.user_metadata,
    });
    const { user, selectedBranch } = await this.prepareLoginContext(profile);

    return {
      accessToken,
      payload: {
        message: 'Login realizado com sucesso.',
        user,
        selectedBranch,
        redirectTo: isSuperAdmin(user) ? 'dev.html' : 'produtos.html',
      },
    };
  }

  async getProfile(user: Express.AuthenticatedUser | undefined) {
    if (!user) {
      throw new UnauthorizedException('Authenticated user not found.');
    }

    return {
      ok: true,
      user: await this.findProfileOrThrow(user.id),
    };
  }

  async forgotPassword(input: ForgotPasswordInput) {
    const email = this.normalizeEmail(input.email);
    const redirectTo = process.env.SUPABASE_PASSWORD_REDIRECT_URL;

    const { error } = await this.supabase.anon.auth.resetPasswordForEmail(
      email,
      redirectTo ? { redirectTo } : undefined,
    );

    if (error) {
      throw new BadRequestException(error.message);
    }

    return {
      ok: true,
      message: 'Password recovery email requested.',
    };
  }

  private async findProfileOrThrow(profileId: string, branchSlug?: string) {
    const profile = await this.findProfileRecord({
      supabaseUserId: profileId,
      profileId,
      branchSlug,
    });

    return this.formatProfileWithMembership(profile, branchSlug);
  }

  private async findOrCreateProfileForLogin(input: {
    supabaseUserId: string;
    email: string;
    metadata?: Record<string, any> | null;
  }) {
    const profile = await this.findProfileRecordOrNull({
      supabaseUserId: input.supabaseUserId,
      email: input.email,
    });

    if (profile) {
      return profile;
    }

    const name = this.normalizeName(
      input.metadata?.name ||
        input.metadata?.full_name ||
        input.email.split('@')[0],
    );
    const role =
      input.metadata?.role === Role.superAdmin ||
      input.metadata?.isSuperAdmin === true ||
      input.metadata?.is_super_admin === true
        ? Role.superAdmin
        : Role.Admin;
    const systemType = this.normalizeSystemType(
      input.metadata?.systemType || SystemType.padrao,
    );
    const createdProfile = await this.prisma.userProfile.create({
      data: {
        id: input.supabaseUserId,
        supabaseUserId: input.supabaseUserId,
        email: input.email,
        name,
        fullName: name,
        role,
        systemType,
        allowedSystemTypes: role === Role.superAdmin ? SUPER_ADMIN_SYSTEM_TYPES : [systemType],
        isSuperAdmin: role === Role.superAdmin,
        accessNameNormalized: normalizeAccessName(name),
      },
      select: { id: true },
    });

    return this.findProfileRecord({
      profileId: createdProfile.id,
    });
  }

  private async findProfileRecord(input: {
    supabaseUserId?: string;
    profileId?: string;
    email?: string;
    branchSlug?: string;
  }) {
    const profile = await this.findProfileRecordOrNull(input);

    if (!profile) {
      throw new UnauthorizedException('User profile not found.');
    }

    return profile;
  }

  private async findProfileRecordOrNull(input: {
    supabaseUserId?: string;
    profileId?: string;
    email?: string;
    branchSlug?: string;
  }) {
    return this.prisma.userProfile.findFirst({
      where: {
        OR: [
          input.supabaseUserId ? { supabaseUserId: input.supabaseUserId } : undefined,
          input.profileId ? { id: input.profileId } : undefined,
          input.email ? { email: input.email } : undefined,
        ].filter(Boolean) as any,
      },
      select: {
        id: true,
        supabaseUserId: true,
        email: true,
        name: true,
        fullName: true,
        accessNameNormalized: true,
        role: true,
        systemType: true,
        allowedSystemTypes: true,
        isSuperAdmin: true,
        tenantId: true,
        primaryTenantId: true,
        createdAt: true,
        memberships: {
          where: input.branchSlug
            ? {
                branch: {
                  slug: input.branchSlug,
                },
              }
            : undefined,
          select: {
            tenantId: true,
            branchId: true,
            role: true,
            tenant: {
              select: {
                id: true,
                name: true,
                slug: true,
                systemType: true,
                mode: true,
              },
            },
            branch: {
              select: {
                id: true,
                name: true,
                slug: true,
                isActive: true,
              },
            },
          },
        },
      },
    });
  }

  private formatProfileWithMembership(
    profile: Awaited<ReturnType<AuthService['findProfileRecord']>>,
    branchSlug?: string,
  ) {
    const hasFullAccess = isSuperAdmin(profile);
    const membership = profile.memberships[0];
    const branches = profile.memberships
      .filter((item) => item.branch?.isActive !== false)
      .map((item) => ({
        id: item.branch!.id,
        name: item.branch!.name,
        slug: item.branch!.slug,
        tenantId: item.tenantId,
        tenant: toTenantSummary(item.tenant),
        role: item.role,
        systemType: item.tenant.systemType,
      }));

    if (!membership && !hasFullAccess) {
      throw new UnauthorizedException('User is not linked to this branch.');
    }

    if (branchSlug && !membership && !hasFullAccess) {
      throw new UnauthorizedException('User is not linked to this branch.');
    }

    return this.formatAuthUser({
      ...profile,
      role: hasFullAccess ? Role.superAdmin : membership!.role,
      tenant: membership?.tenant ?? null,
      branch: membership?.branch ?? null,
      branches,
    });
  }

  private async prepareLoginContext(
    profile: Awaited<ReturnType<AuthService['findProfileRecord']>>,
  ) {
    if (isSuperAdmin(profile)) {
      return this.prepareSuperAdminLoginContext(profile);
    }

    const tenantId = profile.primaryTenantId ?? profile.tenantId ?? profile.memberships[0]?.tenantId;

    if (!tenantId) {
      throw new UnauthorizedException('Usuario sem empresa vinculada.');
    }

    const context = await this.ensureTenantBranchAndMembership({
      profileId: profile.id,
      tenantId,
      branchName: DEFAULT_BRANCH_NAME,
      branchSlug: DEFAULT_BRANCH_SLUG,
      role: profile.memberships[0]?.role ?? Role.Admin,
      setAsProfileTenant: false,
    });
    const refreshed = await this.findProfileRecord({
      profileId: profile.id,
      branchSlug: context.branch.slug,
    });
    const user = this.formatProfileWithMembership(refreshed, context.branch.slug);

    return {
      user,
      selectedBranch: this.formatSelectedBranch(
        context.branch,
        context.tenant.id,
        context.tenant.systemType,
      ),
    };
  }

  private async prepareSuperAdminLoginContext(
    profile: Awaited<ReturnType<AuthService['findProfileRecord']>>,
  ) {
    const tenant = await this.prisma.tenant.upsert({
      where: { slug: DEV_TENANT_SLUG },
      update: {
        name: DEV_TENANT_NAME,
        systemType: SystemType.padrao,
        mode: SystemMode.padrao,
      },
      create: {
        name: DEV_TENANT_NAME,
        slug: DEV_TENANT_SLUG,
        systemType: SystemType.padrao,
        mode: SystemMode.padrao,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        systemType: true,
        mode: true,
      },
    });
    const context = await this.ensureTenantBranchAndMembership({
      profileId: profile.id,
      tenantId: tenant.id,
      branchName: DEV_BRANCH_NAME,
      branchSlug: DEV_BRANCH_SLUG,
      role: Role.Admin,
      setAsProfileTenant: true,
    });
    const refreshed = await this.findProfileRecord({
      profileId: profile.id,
      branchSlug: context.branch.slug,
    });
    const user = this.formatProfileWithMembership(refreshed, context.branch.slug);

    return {
      user,
      selectedBranch: this.formatSelectedBranch(
        context.branch,
        context.tenant.id,
        context.tenant.systemType,
      ),
    };
  }

  private async ensureTenantBranchAndMembership(input: {
    profileId: string;
    tenantId: string;
    branchName: string;
    branchSlug: string;
    role: Role;
    setAsProfileTenant: boolean;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.update({
        where: { id: input.tenantId },
        data: input.setAsProfileTenant
          ? { mode: SystemMode.padrao, systemType: SystemType.padrao }
          : {},
        select: {
          id: true,
          name: true,
          slug: true,
          systemType: true,
          mode: true,
        },
      });
      const branch =
        (await tx.branch.findFirst({
          where: { tenantId: tenant.id, isActive: true },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
          },
        })) ??
        (await tx.branch.create({
          data: {
            tenantId: tenant.id,
            name: input.branchName,
            slug: input.branchSlug,
            isDefault: true,
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
          },
        }));

      await tx.tenantMember.upsert({
        where: {
          tenantId_userProfileId: {
            tenantId: tenant.id,
            userProfileId: input.profileId,
          },
        },
        update: {
          branchId: branch.id,
          role: input.role,
        },
        create: {
          tenantId: tenant.id,
          userProfileId: input.profileId,
          branchId: branch.id,
          role: input.role,
        },
      });

      if (input.setAsProfileTenant) {
        await tx.userProfile.update({
          where: { id: input.profileId },
          data: {
            tenantId: tenant.id,
            primaryTenantId: tenant.id,
            systemType: SystemType.padrao,
          },
        });
      }

      return { tenant, branch };
    });
  }

  private formatSelectedBranch(
    branch: { id: string; name: string; slug?: string },
    tenantId: string,
    systemType: SystemType,
  ) {
    return {
      id: branch.id,
      name: branch.name,
      tenantId,
      systemType,
    };
  }

  private formatAuthUser(profile: {
    id: string;
    supabaseUserId?: string | null;
    email: string | null;
    name: string;
    fullName?: string | null;
    role: Role;
    systemType?: SystemType | null;
    allowedSystemTypes?: SystemType[];
    isSuperAdmin?: boolean;
    tenantId?: string | null;
    primaryTenantId?: string | null;
    tenant: {
      id: string;
      name: string;
      slug: string;
      systemType: SystemType;
      mode?: SystemMode;
    } | null;
    branch: {
      id: string;
      name: string;
      slug: string;
    } | null;
    branches?: Array<{
      id: string;
      name: string;
      slug: string;
      tenantId: string;
      tenant: Express.TenantSummary | null;
      role: Role;
      systemType: SystemType;
    }>;
    createdAt?: Date;
  }) {
    const hasFullAccess = isSuperAdmin(profile);
    const tenantSystemType = profile.tenant?.systemType;
    const allowedSystemTypes = hasFullAccess
      ? SUPER_ADMIN_SYSTEM_TYPES
      : profile.allowedSystemTypes?.length
        ? profile.allowedSystemTypes
        : [profile.systemType ?? tenantSystemType ?? SystemType.padrao];
    const systemType =
      profile.systemType ?? tenantSystemType ?? allowedSystemTypes[0] ?? null;

    return {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      fullName: profile.fullName ?? profile.name,
      role: hasFullAccess ? Role.superAdmin : profile.role,
      roles: [hasFullAccess ? Role.superAdmin : profile.role],
      systemType,
      allowedSystemTypes,
      isSuperAdmin: hasFullAccess,
      is_super_admin: hasFullAccess,
      tenantId: hasFullAccess ? profile.tenantId ?? null : profile.tenant?.id ?? profile.tenantId ?? null,
      primaryTenantId: profile.primaryTenantId ?? null,
      tenant: toTenantSummary(profile.tenant),
      branchId: profile.branch?.id ?? null,
      branch: profile.branch,
      branches: profile.branches ?? [],
      mode: profile.tenant?.mode ?? null,
      createdAt: profile.createdAt,
    };
  }

  private async buildUniqueTenantSlug(rawValue: string) {
    return generateUniqueTenantSlug(rawValue, async (slug) => {
      const existingTenant = await this.prisma.tenant.findUnique({
        where: { slug },
        select: { id: true },
      });

      return Boolean(existingTenant);
    });
  }

  private buildSupabaseAuthException(error: SupabaseAuthError) {
    const details = [
      error.message,
      error.name ? `name=${error.name}` : null,
      error.status ? `status=${error.status}` : null,
      error.code ? `code=${error.code}` : null,
    ].filter(Boolean);

    return new BadRequestException({
      message: details.length
        ? `Supabase Auth createUser failed: ${details.join(' | ')}`
        : 'Supabase Auth createUser failed.',
      supabaseMessage: error.message ?? null,
      supabaseError: error.name ?? null,
      supabaseStatus: error.status ?? null,
      supabaseCode: error.code ?? null,
    });
  }

  private async signInAfterRegister(email: string, password: string) {
    const { data, error } = await withTimeout(
      this.supabase.anon.auth.signInWithPassword({ email, password }),
      SUPABASE_AUTH_TIMEOUT_MS,
      'Supabase Auth did not respond in time.',
    ).catch((error) => {
      if (error instanceof RequestTimeoutException) {
        throw error;
      }

      throw new ServiceUnavailableException(
        'Supabase Auth is temporarily unavailable.',
      );
    });

    if (error || !data.session?.access_token) {
      throw new BadRequestException(
        'Cadastro criado, mas login automatico nao foi concluido.',
      );
    }

    return data.session.access_token;
  }

  private normalizeEmail(email?: string) {
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail) {
      throw new BadRequestException('email is required');
    }

    return normalizedEmail;
  }

  private normalizeName(name?: string) {
    const normalizedName = name?.trim().replace(/\s+/g, ' ');

    if (!normalizedName) {
      throw new BadRequestException('name is required');
    }

    return normalizedName;
  }

  private normalizeCompanyName(companyName?: string) {
    const normalizedCompanyName = companyName?.trim().replace(/\s+/g, ' ');

    if (!normalizedCompanyName) {
      throw new BadRequestException('companyName is required');
    }

    return normalizedCompanyName;
  }

  private normalizePassword(password?: string) {
    if (!password) {
      throw new BadRequestException('password is required');
    }

    if (password.length < 6) {
      throw new BadRequestException(
        'password must be at least 6 characters',
      );
    }

    return password;
  }

  private normalizeSystemType(systemType?: string): SystemType {
    if (systemType === SystemType.padrao || systemType === SystemType.petshop) {
      return systemType;
    }

    throw new BadRequestException('systemType must be padrao or petshop');
  }
}
