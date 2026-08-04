import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const REQUIRED_SCHEMA_COMPATIBILITY_VERSION = 1;
const DEFAULT_READINESS_DATABASE_TIMEOUT_MS = 2000;
const MIN_READINESS_DATABASE_TIMEOUT_MS = 250;
const MAX_READINESS_DATABASE_TIMEOUT_MS = 5000;

type ReadinessFailureReason =
  | 'database_unavailable'
  | 'schema_incompatible'
  | 'readiness_timeout';

type InternalFailureCode =
  | ReadinessFailureReason
  | 'marker_missing'
  | 'marker_lower_than_required'
  | 'structural_canary_failure';

export type SchemaCompatibilityResult =
  | { ready: true; durationMs: number }
  | {
      ready: false;
      reason: ReadinessFailureReason;
      internalCode: InternalFailureCode;
      durationMs: number;
    };

type CompatibilityRow = {
  marker_version: bigint | number | null;
  tenants_table: string | null;
  marker_table: string | null;
  audit_outbox_table: string | null;
  auth_rate_limit_table: string | null;
  upload_quota_reservations_table: string | null;
  audit_outbox_link_column: string | null;
};

@Injectable()
export class SchemaCompatibilityService {
  private readonly logger = new Logger(SchemaCompatibilityService.name);
  private lastState: 'ready' | 'not_ready' | null = null;
  private lastFailureLogAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<SchemaCompatibilityResult> {
    const startedAt = Date.now();
    const timeoutMs = readinessDatabaseTimeoutMs();

    try {
      const [row] = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          SELECT set_config('statement_timeout', ${String(timeoutMs)}, true)
        `;
        return tx.$queryRaw<CompatibilityRow[]>`
          SELECT
            (SELECT MAX(version) FROM schema_compatibility_markers) AS marker_version,
            to_regclass('public.tenants')::text AS tenants_table,
            to_regclass('public.schema_compatibility_markers')::text AS marker_table,
            to_regclass('public.audit_outbox_events')::text AS audit_outbox_table,
            to_regclass('public.auth_rate_limit_buckets')::text AS auth_rate_limit_table,
            to_regclass('public.upload_quota_reservations')::text AS upload_quota_reservations_table,
            (
              SELECT column_name
              FROM information_schema.columns
              WHERE table_schema = 'public'
                AND table_name = 'security_audit_events'
                AND column_name = 'outbox_event_id'
              LIMIT 1
            ) AS audit_outbox_link_column
        `;
      });

      const result = this.evaluateRow(row, Date.now() - startedAt);
      this.recordResult(result);
      return result;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const result: SchemaCompatibilityResult = {
        ready: false,
        reason: isTimeoutError(error)
          ? 'readiness_timeout'
          : 'database_unavailable',
        internalCode: isTimeoutError(error)
          ? 'readiness_timeout'
          : 'database_unavailable',
        durationMs,
      };
      this.recordResult(result);
      return result;
    }
  }

  private evaluateRow(
    row: CompatibilityRow | undefined,
    durationMs: number,
  ): SchemaCompatibilityResult {
    if (!row || row.marker_version == null) {
      return {
        ready: false,
        reason: 'schema_incompatible',
        internalCode: 'marker_missing',
        durationMs,
      };
    }

    const markerVersion = Number(row.marker_version);
    if (
      !Number.isSafeInteger(markerVersion) ||
      markerVersion < REQUIRED_SCHEMA_COMPATIBILITY_VERSION
    ) {
      return {
        ready: false,
        reason: 'schema_incompatible',
        internalCode: 'marker_lower_than_required',
        durationMs,
      };
    }

    const canariesPresent = [
      row.tenants_table,
      row.marker_table,
      row.audit_outbox_table,
      row.auth_rate_limit_table,
      row.upload_quota_reservations_table,
      row.audit_outbox_link_column,
    ].every(Boolean);

    if (!canariesPresent) {
      return {
        ready: false,
        reason: 'schema_incompatible',
        internalCode: 'structural_canary_failure',
        durationMs,
      };
    }

    return { ready: true, durationMs };
  }

  private recordResult(result: SchemaCompatibilityResult) {
    const state = result.ready ? 'ready' : 'not_ready';
    if (this.lastState !== state) {
      this.logger.log(
        JSON.stringify({
          event: 'readiness_state_transition',
          from: this.lastState,
          to: state,
          durationMs: result.durationMs,
          reason: result.ready ? undefined : result.internalCode,
        }),
      );
      this.lastState = state;
    }

    if (result.ready) {
      return;
    }

    const now = Date.now();
    if (now - this.lastFailureLogAt < 30000) {
      return;
    }
    this.lastFailureLogAt = now;
    this.logger.warn(
      JSON.stringify({
        event: 'readiness_failure',
        reason: result.internalCode,
        durationMs: result.durationMs,
      }),
    );
  }
}

export function readinessDatabaseTimeoutMs() {
  const parsed = Number(process.env.READINESS_DATABASE_TIMEOUT_MS);
  if (!Number.isSafeInteger(parsed)) {
    return DEFAULT_READINESS_DATABASE_TIMEOUT_MS;
  }
  return Math.min(
    MAX_READINESS_DATABASE_TIMEOUT_MS,
    Math.max(MIN_READINESS_DATABASE_TIMEOUT_MS, parsed),
  );
}

function isTimeoutError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === '57014' || error.code === 'P1008';
  }
  const message = error instanceof Error ? error.message : String(error);
  return /statement timeout|canceling statement due to statement timeout|timeout/i.test(
    message,
  );
}
