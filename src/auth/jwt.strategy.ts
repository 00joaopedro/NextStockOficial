import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as jwksRsa from 'jwks-rsa';
import type { Request } from 'express';
import { EmployeeStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toTenantSummary } from '../tenancy/tenant.utils';
import {
  canAccessDev,
  isSuperAdmin,
} from './super-admin.util';
import { DevWorkspaceService } from '../tenancy/dev-workspace.service';

const jwtLogger = new Logger('JwtStrategy');

export function cookieExtractor(req: Request): string | null {
  return req?.cookies?.jwt ?? null;
}

type JwtHeader = {
  alg?: string;
  kid?: string;
  typ?: string;
};

type JwtProfile = {
  id: string;
  supabaseUserId: string | null;
  email: string;
  name: string;
  fullName: string | null;
  role: Role;
  systemType: any;
  allowedSystemTypes: any[];
  isSuperAdmin: boolean;
  tenantId: string | null;
  primaryTenantId: string | null;
  memberships: Array<{
    id: string;
    tenantId: string;
    branchId: string | null;
    role: Role;
    createdAt: Date;
    tenant: {
      id: string;
      name: string;
      slug: string;
      systemType: any;
      mode: any;
    };
    branch: {
      id: string;
      name: string;
      slug: string;
      isActive: boolean;
    } | null;
  }>;
};

function decodeBase64UrlJson<T>(value: string): T | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      '=',
    );

    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as T;
  } catch {
    return null;
  }
}

export function decodeJwtHeader(token?: string | null): JwtHeader | null {
  const [header] = token?.split('.') ?? [];
  return header ? decodeBase64UrlJson<JwtHeader>(header) : null;
}

function sanitizeMessage(value?: string | null) {
  return value?.replace(/[\r\n]/g, ' ').slice(0, 220) || 'none';
}

function chooseMembership(profile: Pick<JwtProfile, 'memberships' | 'primaryTenantId' | 'tenantId' | 'systemType'>) {
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

function buildJwtOptions() {
  const jwtFromRequest = ExtractJwt.fromExtractors([
    cookieExtractor,
    ExtractJwt.fromAuthHeaderAsBearerToken(),
  ]);
  const legacySecret = process.env.SUPABASE_JWT_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const jwksProvider = supabaseUrl
    ? (jwksRsa.passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
      }) as any)
    : null;

  if (!legacySecret && !jwksProvider) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_JWT_SECRET env var.');
  }

  return {
    jwtFromRequest,
    ignoreExpiration: false,
    algorithms: ['HS256', 'ES256'] as const,
    secretOrKeyProvider: (
      req: Request,
      rawJwtToken: string,
      done: (error: Error | null, secret?: string | Buffer) => void,
    ) => {
      const header = decodeJwtHeader(rawJwtToken);
      const alg = header?.alg;
      const kid = header?.kid ? `${header.kid.slice(0, 8)}...` : 'none';

      if (process.env.JWT_DIAGNOSTIC_LOGS === 'true') {
        jwtLogger.log(`JWT header decoded alg=${alg ?? 'unknown'} kid=${kid}`);
      }

      if (alg === 'HS256') {
        if (!legacySecret) {
          done(new Error('INVALID_ALGORITHM: HS256 token requires SUPABASE_JWT_SECRET.'));
          return;
        }

        done(null, legacySecret);
        return;
      }

      if (alg === 'ES256') {
        if (!jwksProvider) {
          done(new Error('INVALID_ALGORITHM: ES256 token requires SUPABASE_URL/JWKS.'));
          return;
        }

        jwksProvider(req, rawJwtToken, done);
        return;
      }

      done(new Error(`INVALID_ALGORITHM: Unsupported JWT alg=${sanitizeMessage(alg)}.`));
    },
  };
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly devWorkspaces: DevWorkspaceService,
  ) {
    super(buildJwtOptions());
  }

  async validate(payload: any) {
    const userId = payload?.sub;
    const email =
      typeof payload?.email === 'string'
        ? payload.email.trim().toLowerCase()
        : undefined;

    if (process.env.JWT_DIAGNOSTIC_LOGS === 'true') {
      this.logger.log(
        `validate executed hasSub=${Boolean(userId)} hasEmail=${Boolean(email)}`,
      );
    }

    if (!userId) {
      this.logger.warn('PAYLOAD_INVALID: missing sub in JWT payload.');
      throw new UnauthorizedException('PAYLOAD_INVALID: Invalid token payload (missing sub).');
    }

    const profileSelect = Prisma.validator<Prisma.UserProfileSelect>()({
        id: true,
        supabaseUserId: true,
        email: true,
        name: true,
        fullName: true,
        role: true,
        systemType: true,
        allowedSystemTypes: true,
        isSuperAdmin: true,
        tenantId: true,
        primaryTenantId: true,
        employee: {
          select: {
            status: true,
            dismissalDate: true,
            deletedAt: true,
          },
        },
        memberships: {
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
      });

    let profile = await this.prisma.userProfile.findFirst({
      where: { supabaseUserId: userId },
      select: profileSelect,
    });

    if (!profile) {
      profile = await this.prisma.userProfile.findFirst({
        where: { id: userId },
        select: profileSelect,
      });
    }

    if (!profile && email) {
      profile = await this.prisma.userProfile.findFirst({
        where: { email },
        select: profileSelect,
      });
    }

    if (!profile) {
      this.logger.warn(
        `PROFILE_NOT_FOUND: no profile for sub=${String(userId).slice(0, 8)} email=${email ? 'present' : 'missing'}`,
      );
      throw new UnauthorizedException('PROFILE_NOT_FOUND: User profile not found.');
    }

    if (profile.supabaseUserId && profile.supabaseUserId !== userId) {
      this.logger.error(
        `PROFILE_BINDING_MISMATCH: profile=${profile.id.slice(0, 8)} auth=${String(userId).slice(0, 8)} emailMatch=${Boolean(email && profile.email?.toLowerCase() === email)}`,
      );
      throw new UnauthorizedException(
        'PROFILE_BINDING_MISMATCH: Token does not belong to this profile.',
      );
    }

    if (!profile.supabaseUserId && email && profile.email?.toLowerCase() === email) {
      await this.prisma.userProfile.update({
        where: { id: profile.id },
        data: { supabaseUserId: userId },
        select: { id: true },
      });
      profile.supabaseUserId = userId;
      this.logger.warn('Profile linked to Supabase user id from safe unbound email match.');
    } else if (!profile.supabaseUserId && profile.id !== userId) {
      this.logger.error(
        `PROFILE_BINDING_MISMATCH: unbound profile=${profile.id.slice(0, 8)} has no verified email match`,
      );
      throw new UnauthorizedException(
        'PROFILE_BINDING_MISMATCH: Profile identity could not be verified.',
      );
    }

    const dismissalReached =
      profile.employee?.dismissalDate !== null &&
      profile.employee?.dismissalDate !== undefined &&
      profile.employee.dismissalDate.getTime() <= Date.now();

    if (
      profile.employee?.deletedAt ||
      profile.employee?.status === EmployeeStatus.inactive ||
      profile.employee?.status === EmployeeStatus.dismissed ||
      dismissalReached
    ) {
      this.logger.warn(
        `EMPLOYEE_ACCESS_BLOCKED profile=${profile.id.slice(0, 8)} status=${profile.employee?.status}`,
      );
      throw new UnauthorizedException('EMPLOYEE_INACTIVE: Funcionario inativo ou demitido.');
    }

    const hasFullAccess = isSuperAdmin(profile);
    const hasDevAccess = canAccessDev(profile);
    const workspaceRecords = hasDevAccess
      ? await this.devWorkspaces.listDefaultWorkspaces(profile.id)
      : [];
    const selectedWorkspace = hasDevAccess
      ? workspaceRecords.find(
          (workspace: any) => workspace.systemType === profile.systemType,
        ) ?? workspaceRecords[0]
      : null;
    const membership = hasDevAccess ? null : chooseMembership(profile);
    const branches = hasDevAccess
      ? workspaceRecords.map((workspace: any) => ({
          id: workspace.branch.id,
          name: workspace.branch.name,
          slug: workspace.branch.slug,
          tenantId: workspace.tenantId,
          tenant: toTenantSummary(workspace.tenant),
          role: Role.superAdmin,
          systemType: workspace.systemType,
          mode: workspace.tenant.mode,
          isDevWorkspace: true,
        }))
      : profile.memberships
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

    if (process.env.JWT_DIAGNOSTIC_LOGS === 'true') {
      this.logger.log(
        [
          'profile found',
          `hasTenantId=${Boolean(profile.tenantId)}`,
          `hasPrimaryTenantId=${Boolean(profile.primaryTenantId)}`,
          `memberships=${profile.memberships.length}`,
          `selectedTenant=${selectedWorkspace?.tenantId ?? membership?.tenantId ?? 'none'}`,
          `isSuperAdmin=${hasFullAccess}`,
        ].join(' '),
      );
    }

    if (!membership && !hasFullAccess) {
      this.logger.warn('TENANT_NOT_LINKED: non-superAdmin user has no tenant membership.');
      throw new UnauthorizedException('TENANT_NOT_LINKED: User is not linked to a tenant.');
    }

    const allowedSystemTypes = hasDevAccess
      ? [selectedWorkspace?.systemType ?? profile.systemType ?? 'padrao'].filter(Boolean)
      : profile.allowedSystemTypes?.length > 0
        ? profile.allowedSystemTypes
        : [
            profile.systemType ??
              membership?.tenant.systemType ??
              profile.systemType,
          ].filter(Boolean);
    const systemType =
      selectedWorkspace?.systemType ??
      membership?.tenant.systemType ??
      profile.systemType ??
      allowedSystemTypes[0] ??
      null;
    const selectedTenant = selectedWorkspace?.tenant ?? membership?.tenant ?? null;
    const selectedBranch = selectedWorkspace?.branch ?? membership?.branch ?? null;

    return {
      id: profile.id,
      supabaseUserId: profile.supabaseUserId,
      email: profile.email,
      name: profile.name,
      fullName: profile.fullName ?? profile.name,
      role: hasFullAccess ? Role.superAdmin : membership!.role,
      roles: [hasFullAccess ? Role.superAdmin : membership!.role],
      tenantId: selectedTenant?.id ?? null,
      primaryTenantId: profile.primaryTenantId,
      tenant: selectedTenant ? toTenantSummary(selectedTenant) : null,
      branchId: selectedBranch?.id ?? null,
      branch: selectedBranch ?? null,
      branches,
      devWorkspaces: hasDevAccess
        ? workspaceRecords.map((workspace: any) => ({
            systemType: workspace.systemType,
            selectedBranch: {
              id: workspace.branch.id,
              name: workspace.branch.name,
              slug: workspace.branch.slug,
              tenantId: workspace.tenantId,
              systemType: workspace.systemType,
              isDevWorkspace: true,
            },
          }))
        : undefined,
      systemType,
      allowedSystemTypes,
      isSuperAdmin: hasFullAccess,
      is_super_admin: hasFullAccess,
      isDevSuperAdmin: hasDevAccess,
      mode: membership?.tenant.mode ?? null,
    };
  }
}
