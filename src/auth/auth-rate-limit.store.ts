import { Injectable } from '@nestjs/common';
import { createHmac } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type AuthRateLimitIdentity = 'IP' | 'ACCOUNT';
export type AuthRateLimitDecision = {
  allowed: boolean;
  blockedBy?: AuthRateLimitIdentity;
  retryAfterSeconds: number;
};

@Injectable()
export class AuthRateLimitStore {
  private readonly secret = process.env.AUTH_RATE_LIMIT_HMAC_SECRET || '';

  constructor(private readonly prisma: PrismaService) {}

  async consume(input: {
    action: string;
    ip: string;
    account?: string;
    max: number;
    windowMs: number;
    now?: Date;
  }): Promise<AuthRateLimitDecision> {
    const now = input.now ?? new Date();
    const windowStartMs =
      Math.floor(now.getTime() / input.windowMs) * input.windowMs;
    const windowStart = new Date(windowStartMs);
    const windowEndsAt = new Date(windowStartMs + input.windowMs);
    const identities: Array<[AuthRateLimitIdentity, string]> = [
      ['IP', input.ip],
      ...(input.account
        ? ([['ACCOUNT', input.account]] as Array<
            [AuthRateLimitIdentity, string]
          >)
        : []),
    ];

    const results = await this.prisma.$transaction(async (tx) => {
      const consumed: Array<{ type: AuthRateLimitIdentity; allowed: boolean }> =
        [];
      for (const [type, identity] of identities) {
        const rows = await tx.$queryRaw<
          Array<{ attempt_count: number }>
        >(Prisma.sql`
          INSERT INTO "auth_rate_limit_buckets"
            ("action", "identity_type", "identity_hash", "window_start", "window_ends_at", "attempt_count")
          VALUES
            (${input.action}, ${type}::"AuthRateLimitIdentity", ${this.hash(type, identity)}, ${windowStart}, ${windowEndsAt}, 1)
          ON CONFLICT ("action", "identity_type", "identity_hash", "window_start")
          DO UPDATE SET
            "attempt_count" = "auth_rate_limit_buckets"."attempt_count" + 1,
            "updated_at" = CURRENT_TIMESTAMP
          WHERE "auth_rate_limit_buckets"."attempt_count" < ${input.max}
          RETURNING "attempt_count"
        `);
        consumed.push({ type, allowed: rows.length === 1 });
      }
      return consumed;
    });

    const blocked = results.find((result) => !result.allowed);
    return {
      allowed: !blocked,
      ...(blocked ? { blockedBy: blocked.type } : {}),
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((windowEndsAt.getTime() - now.getTime()) / 1000),
      ),
    };
  }

  async cleanupExpired(limit = 500, now = new Date()) {
    return this.prisma.$executeRaw(Prisma.sql`
      DELETE FROM "auth_rate_limit_buckets"
      WHERE "id" IN (
        SELECT "id" FROM "auth_rate_limit_buckets"
        WHERE "window_ends_at" < ${now}
        ORDER BY "window_ends_at" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
    `);
  }

  private hash(type: AuthRateLimitIdentity, identity: string) {
    return createHmac('sha256', this.secret)
      .update(`sec-016:${type}:${identity}`)
      .digest('hex');
  }
}
