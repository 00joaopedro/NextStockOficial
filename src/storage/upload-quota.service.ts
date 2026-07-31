import {
  ConflictException,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import {
  Prisma,
  UploadQuotaReservationState,
  UploadQuotaScope,
} from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export type UploadQuotaReservation = {
  id: string;
  state: UploadQuotaReservationState;
  objectKeys: string[];
};

type ReserveInput = {
  tenantId: string;
  branchId?: string | null;
  ownerProfileId?: string | null;
  incomingBytes: number;
  incomingFiles?: number;
  idempotencyKey: string;
  objectKeys: string[];
  expiresAt?: Date;
};

@Injectable()
export class UploadQuotaService {
  constructor(private readonly prisma: PrismaService) {}

  async reserve(input: ReserveInput): Promise<UploadQuotaReservation | null> {
    if (process.env.UPLOAD_ENABLE_QUOTAS !== 'true') return null;
    const bytes = this.nonnegativeInteger(input.incomingBytes, 'bytes');
    const files = this.positiveInteger(input.incomingFiles ?? 1, 'files');
    this.assertObjectKeys(input.tenantId, input.objectKeys);
    const intentHash = createHash('sha256')
      .update(
        JSON.stringify({
          tenantId: input.tenantId,
          branchId: input.branchId ?? null,
          ownerProfileId: input.ownerProfileId ?? null,
          bytes,
          files,
          objectKeys: input.objectKeys,
        }),
      )
      .digest('hex');

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.uploadQuotaReservation.findUnique({
            where: {
              tenantId_idempotencyKey: {
                tenantId: input.tenantId,
                idempotencyKey: input.idempotencyKey,
              },
            },
          });
          if (existing) return this.sameIntent(existing, intentHash);

          const tenant = await tx.tenant.findUnique({
            where: { id: input.tenantId },
            select: { currentPlan: { select: { features: true } } },
          });
          const features = tenant?.currentPlan?.features as Record<
            string,
            unknown
          > | null;
          const now = new Date();
          const day = new Date(now);
          day.setUTCHours(0, 0, 0, 0);
          const totalDay = new Date('1970-01-01T00:00:00.000Z');
          const scopes = [
            {
              scope: UploadQuotaScope.TENANT_TOTAL,
              owner: null,
              window: totalDay,
              byteLimit: this.limit(
                features?.uploadStorageBytes,
                'UPLOAD_STORAGE_BYTES_PER_TENANT',
                5 * 1024 ** 3,
              ),
              fileLimit: 2_147_483_647,
            },
            {
              scope: UploadQuotaScope.TENANT_DAILY,
              owner: null,
              window: day,
              byteLimit: this.limit(
                features?.uploadDailyBytes,
                'UPLOAD_DAILY_BYTES_PER_TENANT',
                500 * 1024 ** 2,
              ),
              fileLimit: this.limit(
                features?.uploadDailyFiles,
                'UPLOAD_DAILY_FILES_PER_TENANT',
                200,
              ),
            },
            ...(input.ownerProfileId
              ? [
                  {
                    scope: UploadQuotaScope.USER_DAILY,
                    owner: input.ownerProfileId,
                    window: day,
                    byteLimit: this.limit(
                      undefined,
                      'UPLOAD_DAILY_BYTES_PER_USER',
                      100 * 1024 ** 2,
                    ),
                    fileLimit: 2_147_483_647,
                  },
                ]
              : []),
          ];

          const reservation = await tx.uploadQuotaReservation.create({
            data: {
              tenantId: input.tenantId,
              branchId: input.branchId ?? null,
              ownerProfileId: input.ownerProfileId ?? null,
              idempotencyKey: input.idempotencyKey,
              intentHash,
              requestedBytes: BigInt(bytes),
              requestedFiles: files,
              objectKeys: input.objectKeys,
              expiresAt:
                input.expiresAt ?? new Date(now.getTime() + 15 * 60 * 1000),
            },
          });

          // Fixed scope order prevents tenant/user lock inversion deadlocks.
          for (const item of scopes) {
            await tx.$executeRaw(Prisma.sql`
              INSERT INTO "upload_quota_counters"
                ("tenant_id", "owner_profile_id", "scope", "window_start", "byte_limit", "file_limit")
              VALUES (${input.tenantId}::uuid, ${item.owner}::uuid, ${item.scope}::"UploadQuotaScope", ${item.window}::date, ${BigInt(item.byteLimit)}, ${item.fileLimit})
              ON CONFLICT ("tenant_id", "scope", COALESCE("owner_profile_id", '00000000-0000-0000-0000-000000000000'::uuid), "window_start")
              DO NOTHING
            `);
            const changed = await tx.$executeRaw(Prisma.sql`
              UPDATE "upload_quota_counters"
              SET "reserved_bytes" = "reserved_bytes" + ${BigInt(bytes)},
                  "reserved_files" = "reserved_files" + ${files},
                  "byte_limit" = ${BigInt(item.byteLimit)},
                  "file_limit" = ${item.fileLimit},
                  "updated_at" = NOW()
              WHERE "tenant_id" = ${input.tenantId}::uuid
                AND "scope" = ${item.scope}::"UploadQuotaScope"
                AND "owner_profile_id" IS NOT DISTINCT FROM ${item.owner}::uuid
                AND "window_start" = ${item.window}::date
                AND "confirmed_bytes" + "reserved_bytes" + ${BigInt(bytes)} <= ${BigInt(item.byteLimit)}
                AND "confirmed_files" + "reserved_files" + ${files} <= ${item.fileLimit}
            `);
            if (changed !== 1) {
              throw new PayloadTooLargeException(
                item.scope === UploadQuotaScope.USER_DAILY
                  ? 'Quota diaria do usuario excedida.'
                  : 'Quota de upload do tenant excedida.',
              );
            }
          }
          return this.toResult(reservation);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.uploadQuotaReservation.findUnique({
          where: {
            tenantId_idempotencyKey: {
              tenantId: input.tenantId,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (existing) return this.sameIntent(existing, intentHash);
      }
      throw error;
    }
  }

  assertAllowed(input: Omit<ReserveInput, 'idempotencyKey' | 'objectKeys'>) {
    const key = randomUUID();
    return this.reserve({
      ...input,
      idempotencyKey: key,
      objectKeys: [`${input.tenantId}/quota/${key}`],
    });
  }

  confirm(id: string) {
    return this.transition(id, 'CONFIRMED');
  }

  release(id: string) {
    return this.transition(id, 'RELEASED');
  }

  async requireReconciliation(id: string, error: unknown) {
    await this.prisma.uploadQuotaReservation.updateMany({
      where: {
        id,
        state: {
          in: [
            UploadQuotaReservationState.RESERVED,
            UploadQuotaReservationState.EXPIRED,
          ],
        },
      },
      data: {
        state: UploadQuotaReservationState.RECONCILIATION_REQUIRED,
        reconciliationAt: new Date(),
        lastError: this.errorMessage(error),
      },
    });
  }

  async claimExpired(limit = 100) {
    return this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      WITH candidates AS (
        SELECT "id" FROM "upload_quota_reservations"
        WHERE "state" = 'RESERVED' AND "expires_at" <= NOW()
        ORDER BY "expires_at", "id" LIMIT ${Math.min(Math.max(limit, 1), 500)}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "upload_quota_reservations" reservation
      SET "state" = 'EXPIRED', "claimed_at" = NOW(), "updated_at" = NOW()
      FROM candidates WHERE reservation."id" = candidates."id"
      RETURNING reservation."id"
    `);
  }

  async reconcileExpiredBatch(limit = 100) {
    const claimed = await this.claimExpired(limit);
    for (const { id } of claimed) {
      // The local file row is authoritative for confirmed accounting. The
      // current Storage adapter has no authoritative object-existence API, so
      // an absent row is kept reserved for operator reconciliation.
      const local = await this.prisma.storedFile.findFirst({
        where: {
          quotaReservationId: id,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      if (local) await this.confirm(id);
      else
        await this.requireReconciliation(
          id,
          new Error('expired reservation has no authoritative local file'),
        );
    }
    return claimed.length;
  }

  private async transition(id: string, target: 'CONFIRMED' | 'RELEASED') {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          tenantId: string;
          ownerProfileId: string | null;
          requestedBytes: bigint;
          requestedFiles: number;
          createdAt: Date;
        }>
      >(Prisma.sql`
        UPDATE "upload_quota_reservations"
        SET "state" = ${target}::"UploadQuotaReservationState",
            ${target === 'CONFIRMED' ? Prisma.sql`"confirmed_at"` : Prisma.sql`"released_at"`} = NOW(),
            "updated_at" = NOW()
        WHERE "id" = ${id}::uuid AND "state" IN ('RESERVED', 'EXPIRED')
        RETURNING "tenant_id" AS "tenantId", "owner_profile_id" AS "ownerProfileId",
                  "requested_bytes" AS "requestedBytes", "requested_files" AS "requestedFiles", "created_at" AS "createdAt"
      `);
      if (!rows.length) return false;
      const row = rows[0];
      const day = new Date(row.createdAt);
      day.setUTCHours(0, 0, 0, 0);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "upload_quota_counters"
        SET "reserved_bytes" = "reserved_bytes" - ${row.requestedBytes},
            "reserved_files" = "reserved_files" - ${row.requestedFiles},
            "confirmed_bytes" = "confirmed_bytes" + ${target === 'CONFIRMED' ? row.requestedBytes : 0n},
            "confirmed_files" = "confirmed_files" + ${target === 'CONFIRMED' ? row.requestedFiles : 0},
            "updated_at" = NOW()
        WHERE "tenant_id" = ${row.tenantId}::uuid AND (
          ("scope" = 'TENANT_TOTAL' AND "window_start" = DATE '1970-01-01') OR
          ("scope" = 'TENANT_DAILY' AND "window_start" = ${day}::date) OR
          ("scope" = 'USER_DAILY' AND "owner_profile_id" = ${row.ownerProfileId}::uuid AND "window_start" = ${day}::date)
        )
      `);
      return true;
    });
  }

  private sameIntent(
    reservation: {
      id: string;
      intentHash: string;
      state: UploadQuotaReservationState;
      objectKeys: Prisma.JsonValue;
    },
    hash: string,
  ) {
    if (reservation.intentHash !== hash) {
      throw new ConflictException(
        'A chave de idempotencia ja foi usada com outro upload.',
      );
    }
    return this.toResult(reservation);
  }

  private toResult(reservation: {
    id: string;
    state: UploadQuotaReservationState;
    objectKeys: Prisma.JsonValue;
  }): UploadQuotaReservation {
    return {
      id: reservation.id,
      state: reservation.state,
      objectKeys: reservation.objectKeys as string[],
    };
  }

  private assertObjectKeys(tenantId: string, keys: string[]) {
    if (
      !keys.length ||
      keys.some(
        (key) =>
          !key.startsWith(`${tenantId}/`) ||
          key.includes('..') ||
          key.includes('\\') ||
          key.startsWith('/'),
      )
    ) {
      throw new ConflictException('Object key invalida para o tenant.');
    }
  }

  private nonnegativeInteger(value: number, name: string) {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new TypeError(`${name} must be a nonnegative safe integer`);
    return value;
  }

  private positiveInteger(value: number, name: string) {
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new TypeError(`${name} must be a positive safe integer`);
    return value;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message.slice(0, 500) : 'unknown';
  }

  private limit(feature: unknown, env: string, fallback: number) {
    const value = Number(feature ?? process.env[env] ?? fallback);
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
  }
}
