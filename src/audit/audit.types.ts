import {
  AuditContextKind,
  AuditOutcome,
  AuditSeverity,
  Prisma,
} from '@prisma/client';

export type AuditValue = Record<string, unknown> | null | undefined;

export type SecurityAuditInput = {
  eventType: string;
  severity?: AuditSeverity;
  actorProfileId?: string | null;
  actorRole?: string | null;
  tenantId?: string | null;
  branchId?: string | null;
  contextKind?: AuditContextKind;
  targetType?: string | null;
  targetId?: string | null;
  action: string;
  outcome: AuditOutcome;
  reasonCode?: string | null;
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: AuditValue;
  beforeState?: AuditValue;
  afterState?: AuditValue;
};

export type SanitizedAuditInput = Omit<
  SecurityAuditInput,
  'metadata' | 'beforeState' | 'afterState'
> & {
  metadata?: Prisma.InputJsonValue;
  beforeState?: Prisma.InputJsonValue;
  afterState?: Prisma.InputJsonValue;
};
