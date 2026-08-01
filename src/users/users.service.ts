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
import { createHash, randomUUID } from 'node:crypto';
import { Prisma, UserProvisioningState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantAccessService } from '../tenancy/tenant-access.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { toTenantSummary } from '../tenancy/tenant.utils';
import { SessionsService } from '../sessions/sessions.service';
import { canonicalizeEmail } from '../common/canonical-email';
import {
  AuthOperationError,
  InjectUserAuthAdapter,
  UserAuthAdapter,
} from './user-auth.adapter';

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

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantAccess: TenantAccessService,
    private readonly tenantContext: TenantContextService,
    @Optional() private readonly sessions?: SessionsService,
    @InjectUserAuthAdapter() private readonly userAuth?: UserAuthAdapter,
  ) {}

  async list(currentUser?: AuthenticatedUser, selectedBranchId?: string) {
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
    currentUser: AuthenticatedUser | undefined,
    input: CreateTenantUserInput,
    selectedBranchId?: string,
  ) {
    const context = await this.tenantContext.resolve(currentUser, {
      selectedBranchId,
      requireBranch: true,
      writable: true,
      allowedRoles: [Role.Admin],
    });
    const email = canonicalizeEmail(input.email);
    const name = this.normalizeName(input.name ?? input.email);
    const password = this.normalizePassword(input.password);
    const role = this.parseManagedRole(input.role);
    const tenant = await this.tenantAccess.findTenantOrThrow(context.tenantId);
    const branch = await this.resolveBranch(
      tenant.id,
      context.branchId ?? undefined,
    );
    const accessNameNormalized = this.normalizeAccessName(name);

    const payloadHash = this.payloadHash({
      email,
      name,
      role,
      tenantId: tenant.id,
      branchId: branch?.id ?? null,
    });
    const idempotencyKey = this.payloadHash({
      identity: email,
      tenantId: tenant.id,
      branchId: branch?.id ?? null,
    });
    const claimToken = randomUUID();
    let provisioning;
    let winner = false;
    try {
      provisioning = await this.prisma.userProvisioning.create({
        data: {
          tenantId: tenant.id,
          branchId: branch?.id,
          canonicalEmail: email,
          idempotencyKey,
          payloadHash,
          state: UserProvisioningState.CLAIMED,
          claimToken,
          leaseExpiresAt: new Date(Date.now() + 60_000),
          actorProfileId: context.userId,
          requestedName: name,
          requestedRole: role,
          events: {
            create: {
              tenantId: tenant.id,
              branchId: branch?.id,
              decision: 'claim_won',
              toState: UserProvisioningState.CLAIMED,
            },
          },
        },
      });
      winner = true;
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      )
        throw error;
      provisioning = await this.prisma.userProvisioning.findUnique({
        where: { canonicalEmail: email },
      });
    }
    if (
      !provisioning ||
      provisioning.tenantId !== tenant.id ||
      provisioning.branchId !== (branch?.id ?? null)
    ) {
      throw new ConflictException(
        'User provisioning conflicts with an existing identity claim.',
      );
    }
    if (provisioning.payloadHash !== payloadHash)
      throw new ConflictException(
        'Idempotency key was reused with a different payload.',
      );
    if (!winner) {
      if (provisioning.state === UserProvisioningState.COMPLETED)
        return this.completedProvisioning(
          provisioning.id,
          tenant.id,
          branch?.id ?? null,
        );
      if (
        provisioning.state === UserProvisioningState.FAILED_RETRYABLE &&
        !provisioning.authUserId
      ) {
        const retried = await this.prisma.userProvisioning.updateMany({
          where: {
            id: provisioning.id,
            state: UserProvisioningState.FAILED_RETRYABLE,
            authUserId: null,
          },
          data: {
            state: UserProvisioningState.CLAIMED,
            claimToken,
            leaseExpiresAt: new Date(Date.now() + 60_000),
            attempts: { increment: 1 },
            lastErrorCode: null,
          },
        });
        winner = retried.count === 1;
        if (winner) {
          await this.prisma.userProvisioningEvent.create({
            data: {
              provisioningId: provisioning.id,
              tenantId: tenant.id,
              branchId: branch?.id,
              decision: 'safe_retry_claimed',
              fromState: UserProvisioningState.FAILED_RETRYABLE,
              toState: UserProvisioningState.CLAIMED,
            },
          });
          provisioning = {
            ...provisioning,
            state: UserProvisioningState.CLAIMED,
          };
        }
      }
      if (!winner)
        throw new ConflictException(
          `User provisioning is recoverable (${provisioning.state}).`,
        );
    }

    const adapter = this.userAuth;
    if (!adapter)
      throw new InternalServerErrorException(
        'User Auth adapter is unavailable.',
      );
    let authUser: { id: string; email?: string };
    try {
      authUser = await adapter.create({ email, password, name });
    } catch (error) {
      const known =
        error instanceof AuthOperationError
          ? error
          : new AuthOperationError('AUTH_OUTCOME_UNKNOWN', 'unknown');
      const state =
        known.outcome === 'not-created'
          ? known.code === 'AUTH_EMAIL_EXISTS'
            ? UserProvisioningState.FAILED_FINAL
            : UserProvisioningState.FAILED_RETRYABLE
          : UserProvisioningState.UNKNOWN;
      await this.transition(
        provisioning.id,
        provisioning.state,
        state,
        'auth_create_failed',
        known.code,
      );
      if (known.code === 'AUTH_EMAIL_EXISTS')
        throw new ConflictException(
          'E-mail ja cadastrado; a identidade nao foi vinculada.',
        );
      throw new InternalServerErrorException(
        `User provisioning requires reconciliation (${state}).`,
      );
    }
    await this.transition(
      provisioning.id,
      UserProvisioningState.CLAIMED,
      UserProvisioningState.AUTH_CREATED,
      'auth_created',
      null,
      { authUserId: authUser.id },
    );

    try {
      const profile = await this.prisma.$transaction(async (tx) => {
        const created = await tx.userProfile.create({
          data: {
            id: authUser.id,
            supabaseUserId: authUser.id,
            email,
            name,
            fullName: name,
            accessNameNormalized,
            tenantId: tenant.id,
            primaryTenantId: tenant.id,
            systemType: tenant.systemType,
            allowedSystemTypes: [tenant.systemType],
            isSuperAdmin: false,
          },
          select: {
            id: true,
            email: true,
            name: true,
            createdAt: true,
          },
        });
        const membership = await tx.tenantMember.create({
          data: {
            tenantId: tenant.id,
            branchId: branch?.id,
            userProfileId: created.id,
            role,
          },
        });
        await tx.userProvisioning.update({
          where: { id: provisioning.id },
          data: {
            state: UserProvisioningState.COMPLETED,
            profileId: created.id,
            membershipId: membership.id,
            completedAt: new Date(),
            claimToken: null,
            leaseExpiresAt: null,
          },
        });
        await tx.userProvisioningEvent.create({
          data: {
            provisioningId: provisioning.id,
            tenantId: tenant.id,
            branchId: branch?.id,
            decision: 'local_commit',
            fromState: UserProvisioningState.AUTH_CREATED,
            toState: UserProvisioningState.COMPLETED,
          },
        });
        return created;
      });
      return this.completedProvisioning(
        provisioning.id,
        tenant.id,
        branch?.id ?? null,
      );
    } catch (dbError) {
      await this.transition(
        provisioning.id,
        UserProvisioningState.AUTH_CREATED,
        UserProvisioningState.COMPENSATION_REQUIRED,
        'local_transaction_failed',
        this.errorCode(dbError),
      );
      const deletion = await adapter.delete(authUser.id);
      if (deletion === 'deleted' || deletion === 'absent') {
        await this.transition(
          provisioning.id,
          UserProvisioningState.COMPENSATION_REQUIRED,
          UserProvisioningState.FAILED_RETRYABLE,
          'auth_compensation_confirmed',
          null,
          { authUserId: null, compensationState: 'CONFIRMED' },
        );
      } else {
        await this.transition(
          provisioning.id,
          UserProvisioningState.COMPENSATION_REQUIRED,
          UserProvisioningState.COMPENSATION_REQUIRED,
          'auth_compensation_uncertain',
          'AUTH_DELETE_UNKNOWN',
          { compensationState: 'UNKNOWN' },
        );
      }
      throw new InternalServerErrorException(
        `User creation failed; compensation result: ${deletion}.`,
      );
    }
  }

  async updateRole(
    currentUser: AuthenticatedUser | undefined,
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
      throw new ForbiddenException(
        'Usuario nao pertence a filial selecionada.',
      );
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

  /** Reentrant bounded worker; callers schedule it in a trusted maintenance context. */
  async reconcile(limit = 25) {
    const adapter = this.userAuth;
    if (!adapter)
      throw new InternalServerErrorException(
        'User Auth adapter is unavailable.',
      );
    const candidates = await this.prisma.userProvisioning.findMany({
      where: {
        state: {
          in: [
            UserProvisioningState.AUTH_CREATED,
            UserProvisioningState.COMPENSATION_REQUIRED,
            UserProvisioningState.UNKNOWN,
          ],
        },
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: new Date() } }],
      },
      orderBy: { updatedAt: 'asc' },
      take: Math.max(1, Math.min(limit, 100)),
    });
    const decisions: Array<{ id: string; state: UserProvisioningState }> = [];
    for (const candidate of candidates) {
      const token = randomUUID();
      const claimed = await this.prisma.userProvisioning.updateMany({
        where: {
          id: candidate.id,
          state: candidate.state,
          OR: [
            { leaseExpiresAt: null },
            { leaseExpiresAt: { lt: new Date() } },
          ],
        },
        data: {
          claimToken: token,
          leaseExpiresAt: new Date(Date.now() + 60_000),
          attempts: { increment: 1 },
        },
      });
      if (claimed.count !== 1) continue;
      if (!candidate.authUserId) {
        await this.transition(
          candidate.id,
          candidate.state,
          UserProvisioningState.FAILED_FINAL,
          'manual_reconciliation_required',
          'AUTH_ID_UNKNOWN',
          { claimToken: null, leaseExpiresAt: null },
        );
        decisions.push({
          id: candidate.id,
          state: UserProvisioningState.FAILED_FINAL,
        });
        continue;
      }
      const lookup = await adapter.lookup(candidate.authUserId);
      if (lookup.status === 'unknown') {
        await this.transition(
          candidate.id,
          candidate.state,
          candidate.state,
          'authoritative_lookup_unknown',
          'AUTH_LOOKUP_UNKNOWN',
          { claimToken: null, leaseExpiresAt: null },
        );
        decisions.push({ id: candidate.id, state: candidate.state });
        continue;
      }
      if (lookup.status === 'absent') {
        await this.transition(
          candidate.id,
          candidate.state,
          UserProvisioningState.FAILED_RETRYABLE,
          'auth_absence_confirmed',
          null,
          {
            authUserId: null,
            claimToken: null,
            leaseExpiresAt: null,
            compensationState: 'CONFIRMED',
          },
        );
        decisions.push({
          id: candidate.id,
          state: UserProvisioningState.FAILED_RETRYABLE,
        });
        continue;
      }
      if (canonicalizeEmail(lookup.user.email) !== candidate.canonicalEmail) {
        await this.transition(
          candidate.id,
          candidate.state,
          UserProvisioningState.FAILED_FINAL,
          'authoritative_identity_mismatch',
          'AUTH_IDENTITY_MISMATCH',
          { claimToken: null, leaseExpiresAt: null },
        );
        decisions.push({
          id: candidate.id,
          state: UserProvisioningState.FAILED_FINAL,
        });
        continue;
      }
      if (candidate.state === UserProvisioningState.COMPENSATION_REQUIRED) {
        const deletion = await adapter.delete(candidate.authUserId);
        const next =
          deletion === 'deleted' || deletion === 'absent'
            ? UserProvisioningState.FAILED_RETRYABLE
            : UserProvisioningState.COMPENSATION_REQUIRED;
        await this.transition(
          candidate.id,
          candidate.state,
          next,
          'compensation_retried',
          deletion === 'unknown' ? 'AUTH_DELETE_UNKNOWN' : null,
          {
            authUserId:
              next === UserProvisioningState.FAILED_RETRYABLE
                ? null
                : candidate.authUserId,
            claimToken: null,
            leaseExpiresAt: null,
            compensationState: deletion.toUpperCase(),
          },
        );
        decisions.push({ id: candidate.id, state: next });
        continue;
      }
      await this.completeRecovered(candidate.id);
      decisions.push({
        id: candidate.id,
        state: UserProvisioningState.COMPLETED,
      });
    }
    return decisions;
  }

  private async completeRecovered(id: string) {
    await this.prisma.$transaction(async (tx) => {
      const p = await tx.userProvisioning.findUniqueOrThrow({
        where: { id },
        include: { tenant: true },
      });
      if (!p.authUserId) throw new Error('AUTH_ID_REQUIRED');
      const profile = await tx.userProfile.create({
        data: {
          id: p.authUserId,
          supabaseUserId: p.authUserId,
          email: p.canonicalEmail,
          name: p.requestedName,
          fullName: p.requestedName,
          accessNameNormalized: this.normalizeAccessName(p.requestedName),
          tenantId: p.tenantId,
          primaryTenantId: p.tenantId,
          systemType: p.tenant.systemType,
          allowedSystemTypes: [p.tenant.systemType],
          isSuperAdmin: false,
        },
      });
      const membership = await tx.tenantMember.create({
        data: {
          tenantId: p.tenantId,
          branchId: p.branchId,
          userProfileId: profile.id,
          role: p.requestedRole,
        },
      });
      await tx.userProvisioning.update({
        where: { id },
        data: {
          state: UserProvisioningState.COMPLETED,
          profileId: profile.id,
          membershipId: membership.id,
          completedAt: new Date(),
          claimToken: null,
          leaseExpiresAt: null,
        },
      });
      await tx.userProvisioningEvent.create({
        data: {
          provisioningId: id,
          tenantId: p.tenantId,
          branchId: p.branchId,
          decision: 'reconciliation_completed',
          fromState: p.state,
          toState: UserProvisioningState.COMPLETED,
        },
      });
    });
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

  private payloadHash(value: Record<string, unknown>) {
    const canonical = Object.keys(value)
      .sort()
      .map((key) => `${key}:${JSON.stringify(value[key])}`)
      .join('|');
    return createHash('sha256').update(canonical).digest('hex');
  }

  private errorCode(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError)
      return error.code;
    return 'LOCAL_TRANSACTION_FAILED';
  }

  private async transition(
    id: string,
    fromState: UserProvisioningState,
    toState: UserProvisioningState,
    decision: string,
    errorCode: string | null,
    extra: Prisma.UserProvisioningUpdateInput = {},
  ) {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.userProvisioning.findUniqueOrThrow({
        where: { id },
      });
      await tx.userProvisioning.update({
        where: { id },
        data: { ...extra, state: toState, lastErrorCode: errorCode },
      });
      await tx.userProvisioningEvent.create({
        data: {
          provisioningId: id,
          tenantId: current.tenantId,
          branchId: current.branchId,
          decision,
          fromState,
          toState,
          errorCode,
        },
      });
    });
  }

  private async completedProvisioning(
    id: string,
    tenantId: string,
    branchId: string | null,
  ) {
    const row = await this.prisma.userProvisioning.findFirst({
      where: { id, tenantId, branchId, state: UserProvisioningState.COMPLETED },
      include: {
        profile: true,
        membership: { include: { tenant: true, branch: true } },
      },
    });
    if (!row?.profile || !row.membership)
      throw new ConflictException('User provisioning is not complete.');
    return {
      ok: true,
      user: {
        id: row.profile.id,
        email: row.profile.email,
        name: row.profile.name,
        role: row.membership.role,
        tenantId: row.membership.tenantId,
        branchId: row.membership.branchId,
        createdAt: row.profile.createdAt,
        tenant: toTenantSummary(row.membership.tenant),
        branch: row.membership.branch,
      },
    };
  }

  private normalizePassword(password?: string) {
    if (!password) {
      throw new BadRequestException('email and password are required');
    }

    if (password.length < 6) {
      throw new BadRequestException('password must be at least 6 characters');
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
