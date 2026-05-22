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
  buildTenantNameFromEmail,
  generateUniqueTenantSlug,
  slugify,
  toTenantSummary,
} from '../tenancy/tenant.utils';

type RegisterInput = {
  email?: string;
  name?: string;
  password?: string;
  systemType?: string;
};

type LoginInput = {
  email?: string;
  accessName?: string;
  branch?: string;
  name?: string;
  password?: string;
};

type ForgotPasswordInput = {
  email?: string;
};

const DEFAULT_BRANCH_NAME = 'Matriz';
const DEFAULT_BRANCH_SLUG = 'matriz';
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
    const password = this.normalizePassword(input.password);
    const systemType = this.normalizeSystemType(input.systemType);
    const tenantName = buildTenantNameFromEmail(email);
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

    const { data, error } = await this.supabase.anon.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          systemType,
        },
      },
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
      const result = await this.prisma.$transaction(async (tx) => {
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
          },
          select: {
            id: true,
            name: true,
            slug: true,
          },
        });

        const profile = await tx.userProfile.create({
          data: {
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
            memberships: {
              create: {
                tenantId: tenant.id,
                branchId: branch.id,
                role: Role.Admin,
              },
            },
          },
          select: {
            id: true,
            email: true,
            name: true,
            createdAt: true,
          },
        });

        return { tenant, branch, profile };
      });

      return {
        ok: true,
        user: this.formatAuthUser({
          ...result.profile,
          role: Role.Admin,
          tenant: result.tenant,
          branch: result.branch,
        }),
      };
    } catch {
      await this.supabase.admin.auth.admin
        .deleteUser(authUser.id)
        .catch(() => undefined);

      throw new InternalServerErrorException(
        'User registration failed while creating the tenant/profile. The authentication user was rolled back.',
      );
    }
  }

  async login(input: LoginInput) {
    const email = this.normalizeEmail(input.email);
    const password = this.normalizePassword(input.password);
    const accessName = this.normalizeAccessNameInput(
      input.accessName ?? input.name,
    );
    const branchSlug = input.branch?.trim() ? slugify(input.branch.trim()) : undefined;

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

    const user = await this.findProfileForLoginOrThrow({
      supabaseUserId: data.user.id,
      email,
      accessName,
      branchSlug,
    });

    return {
      accessToken,
      payload: {
        message: 'Login realizado com sucesso',
        user,
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

  private async findProfileForLoginOrThrow(input: {
    supabaseUserId: string;
    email: string;
    accessName: string;
    branchSlug?: string;
  }) {
    const profile = await this.findProfileRecord({
      supabaseUserId: input.supabaseUserId,
      email: input.email,
      branchSlug: input.branchSlug,
    });

    if (profile.accessNameNormalized !== input.accessName) {
      throw new UnauthorizedException('Invalid access name.');
    }

    return this.formatProfileWithMembership(profile, input.branchSlug);
  }

  private async findProfileOrThrow(profileId: string, branchSlug?: string) {
    const profile = await this.findProfileRecord({
      supabaseUserId: profileId,
      profileId,
      branchSlug,
    });

    return this.formatProfileWithMembership(profile, branchSlug);
  }

  private async findProfileRecord(input: {
    supabaseUserId?: string;
    profileId?: string;
    email?: string;
    branchSlug?: string;
  }) {
    const profile = await this.prisma.userProfile.findFirst({
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
          take: 1,
          select: {
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
              },
            },
          },
        },
      },
    });

    if (!profile) {
      throw new UnauthorizedException('User profile not found.');
    }

    return profile;
  }

  private formatProfileWithMembership(
    profile: Awaited<ReturnType<AuthService['findProfileRecord']>>,
    branchSlug?: string,
  ) {
    const isSuperAdmin =
      profile.isSuperAdmin || profile.role === Role.superAdmin;
    const membership = profile.memberships[0];

    if (!membership && !isSuperAdmin) {
      throw new UnauthorizedException('User is not linked to this branch.');
    }

    if (branchSlug && !membership && !isSuperAdmin) {
      throw new UnauthorizedException('User is not linked to this branch.');
    }

    return this.formatAuthUser({
      ...profile,
      role: isSuperAdmin ? Role.superAdmin : membership!.role,
      tenant: isSuperAdmin ? null : membership!.tenant,
      branch: isSuperAdmin ? null : membership!.branch,
    });
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
    createdAt?: Date;
  }) {
    const isSuperAdmin =
      Boolean(profile.isSuperAdmin) || profile.role === Role.superAdmin;
    const tenantSystemType = profile.tenant?.systemType;
    const allowedSystemTypes = isSuperAdmin
      ? [SystemType.padrao, SystemType.petshop]
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
      role: profile.role,
      roles: [profile.role],
      systemType,
      allowedSystemTypes,
      isSuperAdmin,
      tenantId: isSuperAdmin ? null : profile.tenant?.id ?? profile.tenantId ?? null,
      primaryTenantId: isSuperAdmin ? null : profile.primaryTenantId ?? null,
      tenant: toTenantSummary(profile.tenant),
      branchId: profile.branch?.id ?? null,
      branch: profile.branch,
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

  private normalizeAccessNameInput(accessName?: string) {
    const normalizedAccessName = accessName
      ? normalizeAccessName(accessName)
      : '';

    if (!normalizedAccessName) {
      throw new BadRequestException('accessName is required');
    }

    return normalizedAccessName;
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
