import {
  BeforeApplicationShutdown,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import {
  AuditContextKind,
  AuditOutboxEvent,
  AuditOutboxStatus,
  AuditSeverity,
  Prisma,
} from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { auditFingerprint, sanitizeAuditValue } from './audit-sanitizer';
import { SecurityAuditInput } from './audit.types';

type TransactionClient = Prisma.TransactionClient;
export type TransactionalAuditInput = SecurityAuditInput & {
  tenantId: string;
  operationId: string;
};

const DEFAULT_LEASE_MS = 30_000;
const DEFAULT_POLL_MS = 5_000;
const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_BACKLOG_ALERT_THRESHOLD = 100;
const DEFAULT_LAG_SLA_SECONDS = 300;
const DEFAULT_ALERT_COOLDOWN_SECONDS = 300;

type OutboxOperationalSnapshot = {
  pending: number;
  processing: number;
  retryable: number;
  failedFinal: number;
  backlog: number;
  lagSeconds: number;
};

@Injectable()
export class AuditOutboxService
  implements OnModuleInit, BeforeApplicationShutdown, OnApplicationShutdown
{
  private readonly logger = new Logger(AuditOutboxService.name);
  private timer?: NodeJS.Timeout;
  private stopping = false;
  private readonly active = new Set<Promise<unknown>>();
  private readonly alertSentAt = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  async enqueue(tx: TransactionClient, input: TransactionalAuditInput) {
    if (!input.tenantId || !input.operationId)
      throw new Error('AUDIT_OUTBOX_SCOPE_REQUIRED');
    const data = this.data(input);
    await tx.$executeRaw`
      INSERT INTO audit_outbox_events (
        tenant_id, branch_id, actor_profile_id, actor_role, request_id,
        operation_id, payload_hash, event_type, action, outcome, severity,
        context_kind, target_type, target_id, reason_code, ip_hash,
        user_agent_hash, metadata, before_state, after_state
      ) VALUES (
        ${data.tenantId}::uuid, ${data.branchId}::uuid,
        ${data.actorProfileId}::uuid, ${data.actorRole}, ${data.requestId},
        ${data.operationId}, ${data.payloadHash}, ${data.eventType}, ${data.action},
        ${data.outcome}::"AuditOutcome", ${data.severity}::"AuditSeverity",
        ${data.contextKind}::"AuditContextKind", ${data.targetType},
        ${data.targetId}, ${data.reasonCode}, ${data.ipHash}, ${data.userAgentHash},
        ${data.metadata ?? Prisma.JsonNull}, ${data.beforeState ?? Prisma.JsonNull},
        ${data.afterState ?? Prisma.JsonNull}
      ) ON CONFLICT (tenant_id, operation_id) DO NOTHING
    `;
    const existing = await tx.auditOutboxEvent.findUniqueOrThrow({
      where: {
        tenantId_operationId: {
          tenantId: input.tenantId,
          operationId: data.operationId,
        },
      },
    });
    if (existing.payloadHash !== data.payloadHash)
      throw new Error('AUDIT_OUTBOX_IDENTITY_CONFLICT');
    return existing;
  }

  onModuleInit() {
    const role = process.env.NEXTSTOCK_PROCESS_ROLE || 'all';
    if (role === 'api' || process.env.AUDIT_OUTBOX_WORKER_ENABLED === 'false')
      return;
    const pollMs = this.positiveInt(
      process.env.AUDIT_OUTBOX_POLL_MS,
      DEFAULT_POLL_MS,
    );
    this.timer = setInterval(() => this.track(this.processBatch()), pollMs);
    this.timer.unref();
    this.track(
      this.processBatch(
        this.positiveInt(process.env.AUDIT_OUTBOX_BATCH_SIZE, 20),
      ),
    );
  }

  beforeApplicationShutdown() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
  }

  async onApplicationShutdown() {
    const timeout = this.positiveInt(
      process.env.AUDIT_OUTBOX_SHUTDOWN_TIMEOUT_MS,
      10_000,
    );
    if (!this.active.size) return;
    await Promise.race([
      Promise.allSettled([...this.active]),
      new Promise((resolve) => setTimeout(resolve, timeout)),
    ]);
    if (this.active.size)
      this.logger.warn(`audit outbox shutdown pending=${this.active.size}`);
  }

  async processBatch(limit = 20) {
    if (this.stopping) return 0;
    await this.observeOperationalState();
    const claims = await this.claim(Math.max(1, Math.min(limit, 100)));
    await Promise.allSettled(claims.map((claim) => this.deliver(claim)));
    return claims.length;
  }

  private async observeOperationalState() {
    const rows = await this.prisma.$queryRaw<
      Array<{
        pending: bigint;
        processing: bigint;
        retryable: bigint;
        failed_final: bigint;
        oldest_created_at: Date | null;
      }>
    >`SELECT
      COUNT(*) FILTER (WHERE status = 'PENDING') AS pending,
      COUNT(*) FILTER (WHERE status = 'PROCESSING') AS processing,
      COUNT(*) FILTER (WHERE status = 'FAILED_RETRYABLE') AS retryable,
      COUNT(*) FILTER (WHERE status = 'FAILED_FINAL') AS failed_final,
      MIN(created_at) FILTER (WHERE status <> 'DELIVERED') AS oldest_created_at
    FROM audit_outbox_events`;
    const row = rows[0];
    if (!row) return;
    const pending = Number(row.pending);
    const processing = Number(row.processing);
    const retryable = Number(row.retryable);
    const failedFinal = Number(row.failed_final);
    const lagSeconds = row.oldest_created_at
      ? Math.max(
          0,
          Math.floor((Date.now() - row.oldest_created_at.getTime()) / 1000),
        )
      : 0;
    const metrics: OutboxOperationalSnapshot = {
      pending,
      processing,
      retryable,
      failedFinal,
      backlog: pending + processing + retryable,
      lagSeconds,
    };
    this.logger.log(`audit_outbox_metrics ${JSON.stringify(metrics)}`);
    if (process.env.AUDIT_OUTBOX_ALERTING_ENABLED === 'false') return;
    const backlogThreshold = this.positiveInt(
      process.env.AUDIT_OUTBOX_BACKLOG_ALERT_THRESHOLD,
      DEFAULT_BACKLOG_ALERT_THRESHOLD,
    );
    const lagSla = this.positiveInt(
      process.env.AUDIT_OUTBOX_LAG_SLA_SECONDS,
      DEFAULT_LAG_SLA_SECONDS,
    );
    if (failedFinal > 0) this.alert('failed_final', { count: failedFinal });
    if (metrics.backlog >= backlogThreshold)
      this.alert('backlog', {
        count: metrics.backlog,
        threshold: backlogThreshold,
      });
    if (lagSeconds >= lagSla)
      this.alert('lag', { seconds: lagSeconds, slaSeconds: lagSla });
  }

  private alert(kind: string, details: Record<string, number>) {
    const now = Date.now();
    const cooldown =
      this.positiveInt(
        process.env.AUDIT_OUTBOX_ALERT_COOLDOWN_SECONDS,
        DEFAULT_ALERT_COOLDOWN_SECONDS,
      ) * 1000;
    if (now - (this.alertSentAt.get(kind) ?? 0) < cooldown) return;
    this.alertSentAt.set(kind, now);
    this.logger.error(
      `audit_outbox_alert ${JSON.stringify({ alert: kind, ...details })}`,
    );
  }

  async claim(
    limit: number,
  ): Promise<Array<{ id: string; claimToken: string }>> {
    if (this.stopping) return [];
    const leaseMs = this.positiveInt(
      process.env.AUDIT_OUTBOX_LEASE_MS,
      DEFAULT_LEASE_MS,
    );
    return this.prisma.$queryRaw<Array<{ id: string; claimToken: string }>>`
      WITH candidates AS (
        SELECT id FROM audit_outbox_events
        WHERE ((status IN ('PENDING', 'FAILED_RETRYABLE') AND available_at <= NOW())
          OR (status = 'PROCESSING' AND lease_expires_at <= NOW()))
        ORDER BY available_at, created_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      UPDATE audit_outbox_events o SET
        status = 'PROCESSING', claim_token = gen_random_uuid(), claimed_at = NOW(),
        lease_expires_at = NOW() + (${leaseMs} * INTERVAL '1 millisecond'),
        attempt_count = attempt_count + 1, updated_at = NOW(),
        last_error_code = NULL, last_error = NULL
      FROM candidates c WHERE o.id = c.id
      RETURNING o.id, o.claim_token AS "claimToken"
    `;
  }

  async deliver(claim: { id: string; claimToken: string }) {
    try {
      const delivered = await this.prisma.$transaction(async (tx) => {
        const event = await tx.auditOutboxEvent.findFirst({
          where: {
            id: claim.id,
            status: AuditOutboxStatus.PROCESSING,
            claimToken: claim.claimToken,
            leaseExpiresAt: { gt: new Date() },
          },
        });
        if (!event) return false;
        await tx.securityAuditEvent.upsert({
          where: { outboxEventId: event.id },
          create: this.authoritativeEvent(event),
          update: {},
        });
        const finalized = await tx.auditOutboxEvent.updateMany({
          where: {
            id: event.id,
            tenantId: event.tenantId,
            status: AuditOutboxStatus.PROCESSING,
            claimToken: claim.claimToken,
          },
          data: {
            status: AuditOutboxStatus.DELIVERED,
            deliveredAt: new Date(),
            leaseExpiresAt: null,
          },
        });
        if (finalized.count !== 1) throw new Error('AUDIT_OUTBOX_CLAIM_LOST');
        return true;
      });
      if (!delivered)
        this.logger.warn(`stale audit outbox attempt rejected id=${claim.id}`);
      return delivered;
    } catch (error) {
      await this.fail(claim, error);
      return false;
    }
  }

  private async fail(
    claim: { id: string; claimToken: string },
    error: unknown,
  ) {
    const row = await this.prisma.auditOutboxEvent.findFirst({
      where: { id: claim.id, claimToken: claim.claimToken },
      select: { attemptCount: true },
    });
    if (!row) return;
    const max = this.positiveInt(
      process.env.AUDIT_OUTBOX_MAX_ATTEMPTS,
      DEFAULT_MAX_ATTEMPTS,
    );
    const final = row.attemptCount >= max;
    const delay = Math.min(
      300_000,
      1_000 * 2 ** Math.max(0, row.attemptCount - 1),
    );
    const code = this.safeError(error);
    await this.prisma.auditOutboxEvent.updateMany({
      where: {
        id: claim.id,
        status: AuditOutboxStatus.PROCESSING,
        claimToken: claim.claimToken,
      },
      data: {
        status: final
          ? AuditOutboxStatus.FAILED_FINAL
          : AuditOutboxStatus.FAILED_RETRYABLE,
        availableAt: new Date(Date.now() + delay),
        leaseExpiresAt: null,
        lastErrorCode: code,
        lastError: code,
      },
    });
    this.logger[final ? 'error' : 'warn'](
      `audit outbox ${final ? 'failed final' : 'retry scheduled'} id=${claim.id} code=${code}`,
    );
  }

  private data(
    input: TransactionalAuditInput,
  ): Prisma.AuditOutboxEventUncheckedCreateInput {
    const metadata = this.json(input.metadata);
    const beforeState = this.json(input.beforeState);
    const afterState = this.json(input.afterState);
    const operationId = this.text(input.operationId, 200) || '';
    const data = {
      tenantId: input.tenantId,
      branchId: input.branchId || null,
      actorProfileId: input.actorProfileId || null,
      actorRole: this.text(input.actorRole, 40),
      requestId: this.text(input.requestId, 128),
      operationId,
      eventType: this.text(input.eventType, 120) || 'unknown',
      action: this.text(input.action, 120) || 'unknown',
      outcome: input.outcome,
      severity: input.severity ?? AuditSeverity.LOW,
      contextKind: input.contextKind ?? AuditContextKind.NORMAL,
      targetType: this.text(input.targetType, 80),
      targetId: this.text(input.targetId, 160),
      reasonCode: this.text(input.reasonCode, 120),
      ipHash: auditFingerprint(input.ip),
      userAgentHash: auditFingerprint(input.userAgent),
      metadata,
      beforeState,
      afterState,
    };
    return { ...data, payloadHash: this.hash(data) };
  }

  private authoritativeEvent(
    event: AuditOutboxEvent,
  ): Prisma.SecurityAuditEventUncheckedCreateInput {
    return {
      outboxEventId: event.id,
      eventType: event.eventType,
      severity: event.severity,
      actorProfileId: event.actorProfileId,
      actorRole: event.actorRole,
      tenantId: event.tenantId,
      branchId: event.branchId,
      contextKind: event.contextKind,
      targetType: event.targetType,
      targetId: event.targetId,
      action: event.action,
      outcome: event.outcome,
      reasonCode: event.reasonCode,
      requestId: event.requestId,
      ipHash: event.ipHash,
      userAgentHash: event.userAgentHash,
      metadata: event.metadata ?? undefined,
      beforeState: event.beforeState ?? undefined,
      afterState: event.afterState ?? undefined,
    };
  }

  private json(value: unknown) {
    const clean = sanitizeAuditValue(value);
    return clean === null ? undefined : (clean as Prisma.InputJsonValue);
  }
  private hash(value: unknown) {
    return createHash('sha256').update(stableJson(value)).digest('hex');
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
  private safeError(error: unknown) {
    const value =
      error && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : error instanceof Error
          ? error.message
          : 'UNKNOWN';
    return value.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 80) || 'UNKNOWN';
  }
  private positiveInt(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
  private track(promise: Promise<unknown>) {
    this.active.add(promise);
    void promise
      .catch((error: unknown) =>
        this.logger.warn(
          `audit outbox batch failed code=${this.safeError(error)}`,
        ),
      )
      .finally(() => this.active.delete(promise));
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
