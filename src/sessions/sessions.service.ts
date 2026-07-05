import { Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { AuditOutcome, AuditSeverity } from '@prisma/client';
import { createHmac, randomBytes } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

type SessionRequestMetadata = {
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
};

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  async create(input: {
    profileId: string;
    tenantId?: string | null;
    jwtSubject?: string | null;
    expiresAt: Date;
    metadata?: SessionRequestMetadata;
  }) {
    const token = randomBytes(32).toString('base64url');
    const session = await this.prisma.userSession.create({
      data: {
        profileId: input.profileId,
        tenantId: input.tenantId || null,
        jwtSubject: input.jwtSubject || null,
        tokenIdHash: this.hash(token),
        expiresAt: input.expiresAt,
        ipHash: this.fingerprint(input.metadata?.ip),
        userAgentHash: this.fingerprint(input.metadata?.userAgent),
        deviceLabel: this.deviceLabel(input.metadata?.userAgent),
      },
      select: { id: true, expiresAt: true },
    });
    await this.audit?.record({
      eventType: 'session.created',
      action: 'create_session',
      outcome: AuditOutcome.SUCCESS,
      severity: AuditSeverity.LOW,
      actorProfileId: input.profileId,
      tenantId: input.tenantId,
      targetType: 'user_session',
      targetId: session.id,
      requestId: input.metadata?.requestId,
      ip: input.metadata?.ip,
      userAgent: input.metadata?.userAgent,
    });
    return { token, ...session };
  }

  async assertActive(token: string | undefined, profileId: string) {
    if (process.env.SESSION_ENFORCEMENT_ENABLED !== 'true') return null;
    if (!token) {
      throw new UnauthorizedException(
        'SESSION_REQUIRED: Sessao revogavel ausente.',
      );
    }
    const now = new Date();
    const session = await this.prisma.userSession.findUnique({
      where: { tokenIdHash: this.hash(token) },
      select: {
        id: true,
        profileId: true,
        expiresAt: true,
        revokedAt: true,
        lastSeenAt: true,
      },
    });
    if (
      !session ||
      session.profileId !== profileId ||
      session.revokedAt ||
      session.expiresAt <= now
    ) {
      await this.audit?.record({
        eventType: 'session.rejected',
        action: 'validate_session',
        outcome: AuditOutcome.DENIED,
        severity: AuditSeverity.MEDIUM,
        actorProfileId: profileId,
        targetType: 'user_session',
        targetId: session?.id,
        reasonCode: session?.revokedAt ? 'SESSION_REVOKED' : 'SESSION_INVALID',
      });
      throw new UnauthorizedException(
        'SESSION_REVOKED: Sessao expirada ou revogada.',
      );
    }
    if (now.getTime() - session.lastSeenAt.getTime() > 5 * 60_000) {
      await this.prisma.userSession.update({
        where: { id: session.id },
        data: { lastSeenAt: now },
      });
    }
    return session;
  }

  async revokeCurrent(
    token: string | undefined,
    reason = 'logout',
    metadata?: SessionRequestMetadata,
  ) {
    if (!token) return 0;
    const result = await this.prisma.userSession.updateMany({
      where: { tokenIdHash: this.hash(token), revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason.slice(0, 120) },
    });
    await this.audit?.record({
      eventType: 'session.revoked',
      action: 'revoke_current_session',
      outcome: AuditOutcome.SUCCESS,
      severity: AuditSeverity.LOW,
      reasonCode: reason,
      requestId: metadata?.requestId,
      ip: metadata?.ip,
      userAgent: metadata?.userAgent,
      metadata: { revokedCount: result.count },
    });
    return result.count;
  }

  async revokeAllForProfile(
    profileId: string,
    reason: string,
    metadata?: SessionRequestMetadata,
  ) {
    const result = await this.prisma.userSession.updateMany({
      where: { profileId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason.slice(0, 120) },
    });
    await this.audit?.record({
      eventType: 'session.revoked_all',
      action: 'revoke_all_sessions',
      outcome: AuditOutcome.SUCCESS,
      severity: AuditSeverity.MEDIUM,
      actorProfileId: profileId,
      reasonCode: reason,
      requestId: metadata?.requestId,
      ip: metadata?.ip,
      userAgent: metadata?.userAgent,
      metadata: { revokedCount: result.count },
    });
    return result.count;
  }

  async cleanupExpired(retainDays = 120) {
    const cutoff = new Date(Date.now() - retainDays * 86_400_000);
    return this.prisma.userSession.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: cutoff } },
          { revokedAt: { not: null, lt: cutoff } },
        ],
      },
    });
  }

  metadataFromRequest(request: any): SessionRequestMetadata {
    return {
      ip:
        request?.header?.('x-forwarded-for')?.split(',')[0]?.trim() ||
        request?.ip ||
        null,
      userAgent: request?.header?.('user-agent') || null,
      requestId: request?.requestId || null,
    };
  }

  expiresAtFromJwt(token: string) {
    try {
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
      ) as { exp?: number; sub?: string };
      return {
        expiresAt: payload.exp
          ? new Date(payload.exp * 1000)
          : new Date(Date.now() + 60 * 60_000),
        subject: payload.sub || null,
      };
    } catch {
      return {
        expiresAt: new Date(Date.now() + 60 * 60_000),
        subject: null,
      };
    }
  }

  private hash(value: string) {
    return createHmac('sha256', this.secret()).update(value).digest('hex');
  }

  private fingerprint(value?: string | null) {
    return value
      ? createHmac('sha256', this.secret()).update(value).digest('hex')
      : null;
  }

  private secret() {
    const secret =
      process.env.SESSION_HASH_SECRET || process.env.AUDIT_HASH_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error(
        'SESSION_HASH_SECRET or AUDIT_HASH_SECRET must have 32+ characters.',
      );
    }
    return secret;
  }

  private deviceLabel(userAgent?: string | null) {
    if (!userAgent) return null;
    const browser = /firefox/i.test(userAgent)
      ? 'Firefox'
      : /edg/i.test(userAgent)
        ? 'Edge'
        : /chrome/i.test(userAgent)
          ? 'Chrome'
          : /safari/i.test(userAgent)
            ? 'Safari'
            : 'Browser';
    return browser;
  }
}
