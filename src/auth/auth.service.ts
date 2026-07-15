import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  Optional,
  RequestTimeoutException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  EmployeeStatus,
  Prisma,
  Role,
  SystemMode,
  SystemType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import {
  generateUniqueTenantSlug,
  toTenantSummary,
} from '../tenancy/tenant.utils';
import { UsageService } from '../usage/usage.service';
import {
  canAccessDev,
  isSuperAdmin,
} from './super-admin.util';
import { DevWorkspaceService } from '../tenancy/dev-workspace.service';
import { BillingEntitlementService } from '../billing/billing-entitlement.service';
import { SubscriptionsService } from '../billing/subscriptions.service';
import {
  ReferralRegistrationService,
  ValidReferral,
} from '../partners/referral-registration.service';

type RegisterInput = {
  email?: string;
  name?: string;
  companyName?: string;
  password?: string;
  systemType?: string;
  referralCode?: string;
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

type AuthProfileRecord = NonNullable<
  Awaited<ReturnType<AuthService['findProfileRecordOrNull']>>
>;

type AuthMembershipRecord = AuthProfileRecord['memberships'][number];

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
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly prisma: PrismaService,
    private readonly devWorkspaces: DevWorkspaceService,
    @Optional() private readonly usageService?: UsageService,
    @Optional() private readonly referrals?: ReferralRegistrationService,
    @Optional() private readonly subscriptions?: SubscriptionsService,
    @Optional() private readonly billingEntitlement?: BillingEntitlementService,
  ) {}

  async register(input: RegisterInput) {
    const email = this.normalizeEmail(input.email);
    const name = this.normalizeName(input.name);
    const companyName = this.normalizeCompanyName(input.companyName);
    const password = this.normalizePassword(input.password);
    let referral: ValidReferral | null = null;
    if (input.referralCode) {
      referral = (await this.referrals?.resolveActive(input.referralCode)) ?? null;
      if (!referral) {
        await this.referrals?.recordRejected(input.referralCode);
        throw new BadRequestException(
          'Link de indicacao invalido ou indisponivel.',
        );
      }
    }
    const systemType =
      referral?.systemType ?? this.normalizeSystemType(input.systemType);
    const tenantName = companyName;
    const tenantSlug = await this.buildUniqueTenantSlug(tenantName);
    const accessNameNormalized = normalizeAccessName(name);

    const existingProfile = await this.prisma.userProfile
      .findFirst({
        where: {
          OR: [{ email }, { accessNameNormalized }],
        },
        select: { id: true },
      })
      .catch((error) => this.handleKnownPrismaAuthError(error, 'register.lookup'));

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
        throw new ConflictException('E-mail ou nome ja cadastrado.');
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

        if (referral && this.referrals) {
          await this.referrals.createReferral(tx, referral, {
            profileId: profile.id,
            tenantId: tenant.id,
            branchId: branch.id,
          });
        }

        if (this.subscriptions) {
          await this.subscriptions.createTrial(tx, tenant.id);
        }

        return { tenant, branch, profile };
      });
    } catch (error) {
      await this.supabase.admin.auth.admin
        .deleteUser(authUser.id)
        .catch(() => undefined);

      this.logger.error('Registration transaction failed; authentication user rollback requested.');
      this.handleKnownPrismaAuthError(error, 'register.transaction');
      throw new InternalServerErrorException('Nao foi possivel concluir o cadastro.');
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
    await this.usageService?.record({
      userId: user.id,
      tenantId: selectedBranch.tenantId,
      branchId: selectedBranch.id,
      email: user.email,
      name: user.name,
      systemType: selectedBranch.systemType,
      branchName: selectedBranch.name,
      eventType: 'register',
      weight: 2,
      dbWriteCount: 1,
    });

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
    }).catch((error) => this.handleKnownPrismaAuthError(error, 'login.profile'));
    this.assertEmployeeCanAuthenticate(profile);
    const { user, selectedBranch } = await this.prepareLoginContext(profile).catch(
      (error) => this.handleKnownPrismaAuthError(error, 'login.context'),
    );
    const billingState = this.billingEntitlement
      ? await this.billingEntitlement.forUser(user)
      : { allowed: true, reason: 'BILLING_SERVICE_UNAVAILABLE' };
    const billingEnforced =
      process.env.BILLING_ENFORCEMENT_ENABLED?.toLowerCase() === 'true';
    await this.usageService?.record({
      userId: user.id,
      tenantId: selectedBranch?.tenantId ?? user.tenantId,
      branchId: selectedBranch?.id ?? user.branchId,
      email: user.email,
      name: user.name,
      systemType: selectedBranch?.systemType ?? user.systemType,
      branchName: selectedBranch?.name ?? user.branch?.name,
      eventType: 'login',
      weight: 1,
    });

    return {
      accessToken,
      payload: {
        message: 'Login realizado com sucesso.',
        user,
        selectedBranch,
        billingState: {
          allowed: billingState.allowed || !billingEnforced,
          reason: billingState.reason,
          enforcementEnabled: billingEnforced,
        },
        redirectTo: canAccessDev(user)
          ? 'dev.html'
          : billingState.allowed || !billingEnforced
            ? 'produtos.html'
            : 'perfil.html',
      },
    };
  }

  async getProfile(user: AuthenticatedUser | undefined) {
    if (!user) {
      throw new UnauthorizedException('Authenticated user not found.');
    }

    const profile = await this.findProfileRecord({
      supabaseUserId: user.id,
      profileId: user.id,
      email: user.email ?? undefined,
    });
    this.assertEmployeeCanAuthenticate(profile);
    const formattedUser = await this.withDevWorkspaceBranches(
      this.formatProfileWithMembership(profile),
    );
    const currentSelectedBranch = this.resolveSelectedBranchFromUser(formattedUser);

    if (canAccessDev(profile) && !currentSelectedBranch) {
      const context = await this.prepareSuperAdminLoginContext(profile);
      await this.usageService?.record({
        userId: context.user.id,
        tenantId: context.selectedBranch?.tenantId ?? context.user.tenantId,
        branchId: context.selectedBranch?.id ?? context.user.branchId,
        email: context.user.email,
        name: context.user.name,
        systemType: context.selectedBranch?.systemType ?? context.user.systemType,
        branchName: context.selectedBranch?.name ?? context.user.branch?.name,
        eventType: 'profile',
        weight: 1,
        dbReadCount: 1,
      });

      return {
        ok: true,
        user: context.user,
        selectedBranch: context.selectedBranch,
      };
    }

    const profileUser = formattedUser;
    const selectedBranch = this.resolveSelectedBranchFromUser(profileUser);
    const billingState = this.billingEntitlement
      ? await this.billingEntitlement.forUser(profileUser)
      : { allowed: true, reason: 'BILLING_SERVICE_UNAVAILABLE' };
    const billingEnforced =
      process.env.BILLING_ENFORCEMENT_ENABLED?.toLowerCase() === 'true';
    await this.usageService?.record({
      userId: profileUser.id,
      tenantId: selectedBranch?.tenantId ?? profileUser.tenantId,
      branchId: selectedBranch?.id ?? profileUser.branchId,
      email: profileUser.email,
      name: profileUser.name,
      systemType: selectedBranch?.systemType ?? profileUser.systemType,
      branchName: selectedBranch?.name ?? profileUser.branch?.name,
      eventType: 'profile',
      weight: 1,
      dbReadCount: 1,
    });

    return {
      ok: true,
      user: profileUser,
      selectedBranch,
      billingState: {
        allowed: billingState.allowed || !billingEnforced,
        reason: billingState.reason,
        enforcementEnabled: billingEnforced,
      },
    };
  }

  private async withDevWorkspaceBranches(
    user: ReturnType<AuthService['formatAuthUser']>,
  ) {
    if (!canAccessDev(user)) {
      return user;
    }

    const workspaces = await this.devWorkspaces.listDefaultWorkspaces(user.id);

    return {
      ...user,
      branches: workspaces.map((workspace: any) =>
        this.devWorkspaces.toBranchSummary({
          branch: {
            ...workspace.branch,
            tenant: workspace.tenant,
          },
          tenant: workspace.tenant,
          systemType: workspace.systemType,
        }),
      ),
      devWorkspaces: workspaces.map((workspace: any) => ({
        systemType: workspace.systemType,
        selectedBranch: {
          id: workspace.branch.id,
          name: workspace.branch.name,
          slug: workspace.branch.slug,
          tenantId: workspace.tenantId,
          systemType: workspace.systemType,
          isDevWorkspace: true,
        },
      })),
    };
  }

  async forgotPassword(input: ForgotPasswordInput) {
    const email = this.normalizeEmail(input.email);
    const redirectTo = process.env.SUPABASE_PASSWORD_REDIRECT_URL;

    const { error } = await this.supabase.anon.auth.resetPasswordForEmail(
      email,
      redirectTo ? { redirectTo } : undefined,
    );

    if (error) this.logger.warn('Password recovery provider request was not completed.');

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
    const profile = await this.findProfileForSupabaseIdentity(input);

    if (profile) {
      return profile;
    }

    this.logger.warn(
      `LOGIN_PROFILE_MISSING auth=${input.supabaseUserId.slice(0, 8)}`,
    );
    throw new ConflictException(
      'Cadastro incompleto: usuario sem perfil vinculado. Solicite suporte.',
    );
  }

  private async findProfileForSupabaseIdentity(input: {
    supabaseUserId: string;
    email: string;
  }) {
    const bySupabaseId = await this.findProfileRecordOrNull({
      supabaseUserId: input.supabaseUserId,
    });

    if (bySupabaseId) {
      return bySupabaseId;
    }

    const byProfileId = await this.findProfileRecordOrNull({
      profileId: input.supabaseUserId,
    });

    if (byProfileId) {
      if (
        byProfileId.supabaseUserId &&
        byProfileId.supabaseUserId !== input.supabaseUserId
      ) {
        this.logger.error(
          `SECURITY_PROFILE_BINDING_MISMATCH profile=${byProfileId.id.slice(0, 8)} auth=${input.supabaseUserId.slice(0, 8)}`,
        );
        throw new UnauthorizedException('Perfil nao corresponde ao usuario autenticado.');
      }

      if (!byProfileId.supabaseUserId) {
        await this.linkProfileToSupabaseUser(byProfileId.id, input.supabaseUserId);
        return this.findProfileRecord({ profileId: byProfileId.id });
      }

      return byProfileId;
    }

    const byEmail = await this.findProfileRecordOrNull({ email: input.email });

    if (!byEmail) {
      return null;
    }

    if (
      byEmail.supabaseUserId &&
      byEmail.supabaseUserId !== input.supabaseUserId
    ) {
      this.logger.error(
        `SECURITY_PROFILE_BINDING_MISMATCH profile=${byEmail.id.slice(0, 8)} auth=${input.supabaseUserId.slice(0, 8)} emailMatch=true`,
      );
      throw new UnauthorizedException('Perfil nao corresponde ao usuario autenticado.');
    }

    await this.linkProfileToSupabaseUser(byEmail.id, input.supabaseUserId);
    return this.findProfileRecord({ profileId: byEmail.id });
  }

  private async linkProfileToSupabaseUser(profileId: string, supabaseUserId: string) {
    await this.prisma.userProfile.update({
      where: { id: profileId },
      data: { supabaseUserId },
      select: { id: true },
    });
    this.logger.warn(
      `SECURITY_PROFILE_BINDING_CREATED profile=${profileId.slice(0, 8)} auth=${supabaseUserId.slice(0, 8)}`,
    );
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
        employee: {
          select: {
            status: true,
            dismissalDate: true,
            deletedAt: true,
          },
        },
        memberships: {
          where: input.branchSlug
            ? {
                branch: {
                  slug: input.branchSlug,
                },
              }
            : undefined,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            tenantId: true,
            branchId: true,
            role: true,
            createdAt: true,
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

  private chooseMembership(
    profile: Pick<
      AuthProfileRecord,
      'memberships' | 'primaryTenantId' | 'tenantId' | 'systemType'
    >,
  ): AuthMembershipRecord | undefined {
    const memberships = profile.memberships.filter(
      (membership) => membership.branch?.isActive === true,
    );

    return (
      memberships.find(
        (membership) =>
          Boolean(profile.primaryTenantId) &&
          membership.tenantId === profile.primaryTenantId,
      ) ??
      memberships.find(
        (membership) =>
          Boolean(profile.tenantId) && membership.tenantId === profile.tenantId,
      ) ??
      memberships.find(
        (membership) =>
          Boolean(profile.systemType) &&
          membership.tenant.systemType === profile.systemType,
      ) ??
      memberships[0]
    );
  }

  private assertEmployeeCanAuthenticate(profile: {
    id: string;
    employee?: {
      status: EmployeeStatus;
      dismissalDate: Date | null;
      deletedAt: Date | null;
    } | null;
  }) {
    const employee = profile.employee;

    if (!employee) {
      return;
    }

    const dismissalReached =
      employee.dismissalDate !== null &&
      employee.dismissalDate.getTime() <= Date.now();

    if (
      employee.deletedAt ||
      employee.status === EmployeeStatus.inactive ||
      employee.status === EmployeeStatus.dismissed ||
      dismissalReached
    ) {
      this.logger.warn(
        `EMPLOYEE_ACCESS_BLOCKED profile=${profile.id.slice(0, 8)} status=${employee.status}`,
      );
      throw new ForbiddenException('Funcionario inativo ou demitido.');
    }
  }

  private formatProfileWithMembership(
    profile: Awaited<ReturnType<AuthService['findProfileRecord']>>,
    branchSlug?: string,
  ) {
    const hasSuperAdminRole = isSuperAdmin(profile);
    const hasDevAccess = canAccessDev(profile);
    const membership = this.chooseMembership(profile);
    const branches = profile.memberships
      .filter((item) => item.branch?.isActive === true)
      .map((item) => ({
        id: item.branch!.id,
        name: item.branch!.name,
        slug: item.branch!.slug,
        tenantId: item.tenantId,
        tenant: toTenantSummary(item.tenant),
        role: item.role,
        systemType: item.tenant.systemType,
        mode: item.tenant.mode,
      }));

    if (!membership && !hasDevAccess) {
      throw new UnauthorizedException('User is not linked to this branch.');
    }

    if (branchSlug && !membership && !hasDevAccess) {
      throw new UnauthorizedException('User is not linked to this branch.');
    }

    return this.formatAuthUser({
      ...profile,
      role: hasSuperAdminRole ? Role.superAdmin : membership!.role,
      tenant: membership?.tenant ?? null,
      branch: membership?.branch ?? null,
      branches,
    });
  }

  private async prepareLoginContext(
    profile: Awaited<ReturnType<AuthService['findProfileRecord']>>,
  ) {
    if (canAccessDev(profile)) {
      return this.prepareSuperAdminLoginContext(profile);
    }

    const membership = this.chooseMembership(profile);

    if (!membership) {
      this.logger.warn(
        `LOGIN_MEMBERSHIP_MISSING profile=${profile.id.slice(0, 8)} tenant=${profile.primaryTenantId ?? profile.tenantId ?? 'none'}`,
      );
      throw new ConflictException('Usuario sem empresa/filial vinculada.');
    }

    if (!membership.branchId || !membership.branch?.isActive) {
      this.logger.warn(
        `LOGIN_BRANCH_INVALID profile=${profile.id.slice(0, 8)} membership=${membership.id.slice(0, 8)} branch=${membership.branchId ?? 'none'}`,
      );
      throw new ConflictException(
        'Usuario sem filial ativa vinculada. Solicite acesso ao administrador.',
      );
    }

    const user = this.formatProfileWithMembership(profile, membership.branch.slug);

    return {
      user,
      selectedBranch: this.formatSelectedBranch(
        membership.branch,
        membership.tenant.id,
        membership.tenant.systemType,
      ),
    };
  }

  private async prepareSuperAdminLoginContext(
    profile: Awaited<ReturnType<AuthService['findProfileRecord']>>,
  ) {
    await this.devWorkspaces.ensureDefaultWorkspaces(profile.id);
    const systemType = this.devWorkspaces.normalizeSystemType(profile.systemType);
    const context = await this.devWorkspaces.ensureDefaultWorkspace(
      profile.id,
      systemType,
    );
    const refreshed = await this.findProfileRecord({
      profileId: profile.id,
      branchSlug: context.branch.slug,
    });
    const user = await this.withDevWorkspaceBranches(
      this.formatProfileWithMembership(refreshed, context.branch.slug),
    );

    return {
      user,
      selectedBranch: this.formatSelectedBranch(
        context.branch,
        context.tenant.id,
        context.tenant.systemType,
        true,
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
    isDevWorkspace = false,
  ) {
    return {
      id: branch.id,
      name: branch.name,
      tenantId,
      systemType,
      ...(isDevWorkspace ? { isDevWorkspace: true } : {}),
    };
  }

  private resolveSelectedBranchFromUser(user: ReturnType<AuthService['formatAuthUser']>) {
    const firstBranch =
      user.branches?.find((branch) => branch.systemType === user.systemType) ??
      user.branches?.[0];

    if (user.branch?.id && user.tenantId) {
      const realBranch = user.branches?.find((branch) => branch.id === user.branch?.id);

      return {
        id: user.branch.id,
        name: user.branch.name,
        tenantId: realBranch?.tenantId ?? user.tenantId,
        systemType: realBranch?.systemType ?? user.systemType ?? SystemType.padrao,
        ...(realBranch?.isDevWorkspace ? { isDevWorkspace: true } : {}),
      };
    }

    if (firstBranch?.id && firstBranch.tenantId) {
      return {
        id: firstBranch.id,
        name: firstBranch.name,
        tenantId: firstBranch.tenantId,
        systemType: firstBranch.systemType ?? user.systemType ?? SystemType.padrao,
        ...(firstBranch.isDevWorkspace ? { isDevWorkspace: true } : {}),
      };
    }

    return null;
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
      tenant: TenantSummary | null;
      role: Role;
      systemType: SystemType;
      mode?: SystemMode;
      isDevWorkspace?: boolean;
    }>;
    createdAt?: Date;
  }) {
    const hasSuperAdminRole = isSuperAdmin(profile);
    const hasDevAccess = canAccessDev(profile);
    const tenantSystemType = profile.tenant?.systemType;
    const allowedSystemTypes = hasDevAccess
      ? [tenantSystemType ?? profile.systemType ?? SystemType.padrao].filter(Boolean)
      : profile.allowedSystemTypes?.length
        ? profile.allowedSystemTypes
        : [profile.systemType ?? tenantSystemType ?? SystemType.padrao];
    const systemType =
      tenantSystemType ?? profile.systemType ?? allowedSystemTypes[0] ?? null;

    return {
      id: profile.id,
      supabaseUserId: profile.supabaseUserId ?? null,
      email: profile.email,
      name: profile.name,
      fullName: profile.fullName ?? profile.name,
      role: hasSuperAdminRole ? Role.superAdmin : profile.role,
      roles: [hasSuperAdminRole ? Role.superAdmin : profile.role],
      systemType,
      allowedSystemTypes,
      isSuperAdmin: hasSuperAdminRole,
      is_super_admin: hasSuperAdminRole,
      isDevSuperAdmin: hasDevAccess,
      tenantId: profile.tenant?.id ?? profile.tenantId ?? null,
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
    this.logger.warn(
      `Supabase Auth operation rejected code=${String(error.code ?? 'unknown').replace(/[\r\n]/g, '').slice(0, 40)}`,
    );
    return new BadRequestException('Nao foi possivel concluir o cadastro.');
  }

  private handleKnownPrismaAuthError(error: unknown, phase: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      this.logger.warn(
        `AUTH_PRISMA_KNOWN phase=${phase} code=${error.code} meta=${this.sanitizePrismaMeta(error.meta)}`,
      );

      if (error.code === 'P2002') {
        throw new ConflictException('E-mail ou nome ja cadastrado.');
      }

      if (error.code === 'P2003' || error.code === 'P2025') {
        throw new ConflictException(
          'Cadastro inconsistente: empresa, filial ou perfil vinculado nao encontrado.',
        );
      }

      if (error.code === 'P2021' || error.code === 'P2022' || error.code === 'P2010') {
        throw new ServiceUnavailableException(
          'Banco de dados indisponivel ou desatualizado. Execute as migrations pendentes.',
          { cause: error },
        );
      }

      throw new ServiceUnavailableException(
        'Falha conhecida de banco de dados durante autenticacao.',
        { cause: error },
      );
    }

    throw error;
  }

  private sanitizePrismaMeta(meta: unknown) {
    if (!meta || typeof meta !== 'object') {
      return '{}';
    }

    const allowedKeys = new Set(['modelName', 'target', 'field_name', 'column', 'table']);
    const sanitized = Object.fromEntries(
      Object.entries(meta as Record<string, unknown>)
        .filter(([key]) => allowedKeys.has(key))
        .map(([key, value]) => [key, String(value).replace(/[\r\n\t]/g, ' ').slice(0, 120)]),
    );

    return JSON.stringify(sanitized);
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
