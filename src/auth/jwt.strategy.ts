import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as jwksRsa from 'jwks-rsa';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { toTenantSummary } from '../tenancy/tenant.utils';
import { isSuperAdmin, SUPER_ADMIN_SYSTEM_TYPES } from './super-admin.util';

function cookieExtractor(req: Request): string | null {
  return req?.cookies?.jwt ?? null;
}

function buildJwtOptions() {
  const jwtFromRequest = ExtractJwt.fromExtractors([
    cookieExtractor,
    ExtractJwt.fromAuthHeaderAsBearerToken(),
  ]);

  if (process.env.SUPABASE_JWT_SECRET) {
    return {
      jwtFromRequest,
      ignoreExpiration: false,
      algorithms: ['HS256'] as const,
      secretOrKey: process.env.SUPABASE_JWT_SECRET,
    };
  }

  const supabaseUrl = process.env.SUPABASE_URL;

  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_JWT_SECRET env var.');
  }

  return {
    jwtFromRequest,
    ignoreExpiration: false,
    algorithms: ['ES256'] as const,
    secretOrKeyProvider: jwksRsa.passportJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
    }) as any,
  };
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super(buildJwtOptions());
  }

  async validate(payload: any) {
    const userId = payload?.sub;

    if (!userId) {
      throw new UnauthorizedException('Invalid token payload (missing sub).');
    }

    const profile = await this.prisma.userProfile.findFirst({
      where: {
        OR: [{ supabaseUserId: userId }, { id: userId }],
      },
      select: {
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
        memberships: {
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

    const hasFullAccess = isSuperAdmin(profile);
    const membership = profile.memberships[0];

    if (!membership && !hasFullAccess) {
      throw new UnauthorizedException('User is not linked to a tenant.');
    }

    const allowedSystemTypes = hasFullAccess
      ? SUPER_ADMIN_SYSTEM_TYPES
      : profile.allowedSystemTypes.length > 0
        ? profile.allowedSystemTypes
        : [
            profile.systemType ??
              membership?.tenant.systemType ??
              profile.systemType,
          ].filter(Boolean);
    const systemType =
      profile.systemType ?? membership?.tenant.systemType ?? allowedSystemTypes[0] ?? null;

    return {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      fullName: profile.fullName ?? profile.name,
      role: hasFullAccess ? 'superAdmin' : membership!.role,
      roles: [hasFullAccess ? 'superAdmin' : membership!.role],
      tenantId: hasFullAccess
        ? profile.tenantId
        : membership!.tenant.id,
      primaryTenantId: profile.primaryTenantId,
      tenant: hasFullAccess ? null : toTenantSummary(membership!.tenant),
      branchId: hasFullAccess ? null : membership!.branch?.id ?? null,
      branch: hasFullAccess ? null : membership!.branch,
      systemType,
      allowedSystemTypes,
      isSuperAdmin: hasFullAccess,
      is_super_admin: hasFullAccess,
      mode: hasFullAccess ? null : membership!.tenant.mode,
    };
  }
}
