import { Injectable, Logger } from '@nestjs/common';
import { AuditContextKind, AuditSeverity, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { auditFingerprint, sanitizeAuditValue } from './audit-sanitizer';
import { SecurityAuditInput } from './audit.types';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: SecurityAuditInput) {
    try {
      const metadata = sanitizeAuditValue(input.metadata);
      const beforeState = sanitizeAuditValue(input.beforeState);
      const afterState = sanitizeAuditValue(input.afterState);

      return await this.prisma.securityAuditEvent.create({
        data: {
          eventType: this.text(input.eventType, 120) || 'unknown',
          severity: input.severity ?? AuditSeverity.LOW,
          actorProfileId: input.actorProfileId || null,
          actorRole: this.text(input.actorRole, 40),
          tenantId: input.tenantId || null,
          branchId: input.branchId || null,
          contextKind: input.contextKind ?? AuditContextKind.NORMAL,
          targetType: this.text(input.targetType, 80),
          targetId: this.text(input.targetId, 160),
          action: this.text(input.action, 120) || 'unknown',
          outcome: input.outcome,
          reasonCode: this.text(input.reasonCode, 120),
          requestId: this.text(input.requestId, 128),
          ipHash: auditFingerprint(input.ip),
          userAgentHash: auditFingerprint(input.userAgent),
          metadata:
            metadata === null ? undefined : (metadata as Prisma.InputJsonValue),
          beforeState:
            beforeState === null
              ? undefined
              : (beforeState as Prisma.InputJsonValue),
          afterState:
            afterState === null
              ? undefined
              : (afterState as Prisma.InputJsonValue),
        },
      });
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String(error.code)
          : 'UNKNOWN';
      this.logger.warn(`Security audit write failed code=${code}`);
      return null;
    }
  }

  fromRequest(request: any) {
    const user = request?.user as Express.AuthenticatedUser | undefined;
    const context = request?.tenantContext as
      | { tenantId?: string; branchId?: string; contextKind?: string }
      | undefined;
    return {
      actorProfileId: user?.id ?? null,
      actorRole: user?.role ?? null,
      tenantId: context?.tenantId ?? user?.tenantId ?? null,
      branchId: context?.branchId ?? user?.branchId ?? null,
      contextKind: this.contextKind(context?.contextKind),
      requestId: request?.requestId ?? null,
      ip:
        request?.header?.('x-forwarded-for')?.split(',')[0]?.trim() ||
        request?.ip ||
        null,
      userAgent: request?.header?.('user-agent') ?? null,
    };
  }

  private contextKind(value?: string) {
    if (value === 'dev-support') return AuditContextKind.DEV_SUPPORT;
    if (value === 'dev-workspace') return AuditContextKind.DEV_WORKSPACE;
    return AuditContextKind.NORMAL;
  }

  private text(value: unknown, max: number) {
    if (value === null || value === undefined) return null;
    return (
      String(value)
        .replace(/[\r\n]/g, ' ')
        .trim()
        .slice(0, max) || null
    );
  }
}
