import 'dotenv/config';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  describeDatabaseUrl,
  selectAdministrativeDatabaseUrl,
} from '../lib/admin-database-url';

type Count = { count: bigint | number };
type AdvisoryLockMarker = { acquired: number };
type Role = {
  rolname: string;
  rolcanlogin: boolean;
  rolsuper: boolean;
  rolcreatedb: boolean;
  rolcreaterole: boolean;
};

export function migrationInventory(
  root = join(process.cwd(), 'prisma/migrations'),
) {
  const sql = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) =>
      readFileSync(join(root, entry.name, 'migration.sql'), 'utf8'),
    )
    .join('\n');
  const count = (pattern: RegExp) => [...sql.matchAll(pattern)].length;
  return {
    migrations: readdirSync(root, { withFileTypes: true }).filter((e) =>
      e.isDirectory(),
    ).length,
    requiredExtensions: [
      ...new Set(
        [
          ...sql.matchAll(
            /CREATE\s+EXTENSION(?:\s+IF\s+NOT\s+EXISTS)?\s+["']?([\w-]+)/gi,
          ),
        ].map((m) => m[1].toLowerCase()),
      ),
    ].sort(),
    customFunctions: count(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION/gi),
    triggers: count(/CREATE\s+TRIGGER/gi),
    views: count(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW/gi),
    policies: count(/CREATE\s+POLICY/gi),
    rlsTables: count(/ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi),
    indexes: count(/CREATE\s+(?:UNIQUE\s+)?INDEX/gi),
    enums: count(/CREATE\s+TYPE[\s\S]{0,120}?AS\s+ENUM/gi),
    grants: count(/\b(?:GRANT|REVOKE)\b/gi),
  };
}

function requireCondition(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition)
    throw new Error(`PostgreSQL portability requirement failed: ${message}`);
}

function assertAdvisoryLockMarker(rows: AdvisoryLockMarker[]) {
  requireCondition(
    rows.length === 1 && rows[0]?.acquired === 1,
    'failed to acquire PostgreSQL advisory transaction lock',
  );
}

async function acquireAdvisoryTransactionLock(
  tx: Prisma.TransactionClient,
  lockKey: bigint,
) {
  const rows = await tx.$queryRaw<AdvisoryLockMarker[]>`
    WITH lock_acquisition AS MATERIALIZED (
      SELECT pg_advisory_xact_lock(${lockKey})
    )
    SELECT 1::integer AS acquired
    FROM lock_acquisition
  `;
  assertAdvisoryLockMarker(rows);
}

async function validate() {
  const url = selectAdministrativeDatabaseUrl(process.env);
  const inventory = migrationInventory();
  const first = new PrismaClient({ datasourceUrl: url });
  const second = new PrismaClient({ datasourceUrl: url });
  try {
    await Promise.all([first.$connect(), second.$connect()]);
    const [version] = await first.$queryRaw<
      Array<{ version: number }>
    >`SELECT current_setting('server_version_num')::int AS version`;
    requireCondition(
      version.version >= 160000,
      'PostgreSQL 16 or newer is required',
    );
    const roles = await first.$queryRaw<
      Role[]
    >`SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') ORDER BY rolname`;
    requireCondition(
      roles.length === 3,
      'legacy roles anon, authenticated and service_role must exist',
    );
    requireCondition(
      roles.every(
        (r) =>
          !r.rolcanlogin && !r.rolsuper && !r.rolcreatedb && !r.rolcreaterole,
      ),
      'legacy roles must remain NOLOGIN and unprivileged',
    );
    const extensions = await first.$queryRaw<
      Array<{ extname: string }>
    >`SELECT extname FROM pg_extension ORDER BY extname`;
    for (const extension of inventory.requiredExtensions)
      requireCondition(
        extensions.some((row) => row.extname === extension),
        `required extension ${extension} is unavailable`,
      );
    const [uuid] = await first.$queryRaw<
      Array<{ value: string }>
    >`SELECT gen_random_uuid()::text AS value`;
    requireCondition(
      /^[0-9a-f-]{36}$/.test(uuid.value),
      'gen_random_uuid() must execute',
    );
    const [marker] = await first.$queryRaw<
      Count[]
    >`SELECT count(*)::int AS count FROM schema_compatibility_markers WHERE version >= 1`;
    requireCondition(
      Number(marker.count) > 0,
      'REL-016 schema compatibility marker is missing',
    );

    // Real two-session transaction-lock probe on pinned interactive transactions.
    let lockReady!: () => void;
    let releaseLock!: () => void;
    const ready = new Promise<void>((resolve) => (lockReady = resolve));
    const release = new Promise<void>((resolve) => (releaseLock = resolve));
    const holder = first.$transaction(async (tx) => {
      await acquireAdvisoryTransactionLock(tx, 2602001n);
      lockReady();
      await release;
    });
    await ready;
    const [same] = await second.$queryRaw<
      Array<{ acquired: boolean }>
    >`SELECT pg_try_advisory_xact_lock(2602001) AS acquired`;
    const [different] = await second.$queryRaw<
      Array<{ acquired: boolean }>
    >`SELECT pg_try_advisory_xact_lock(2602002) AS acquired`;
    requireCondition(
      !same.acquired && different.acquired,
      'advisory locks must serialize equal keys only',
    );
    releaseLock();
    await holder;
    const [released] = await second.$queryRaw<
      Array<{ acquired: boolean }>
    >`SELECT pg_try_advisory_xact_lock(2602001) AS acquired`;
    requireCondition(
      released.acquired,
      'commit must release transaction advisory lock',
    );

    let rollbackReady!: () => void;
    let releaseRollback!: () => void;
    const rollbackLocked = new Promise<void>(
      (resolve) => (rollbackReady = resolve),
    );
    const rollbackRelease = new Promise<void>(
      (resolve) => (releaseRollback = resolve),
    );
    const expectedRollback = new Error('PHASE2_EXPECTED_LOCK_ROLLBACK');
    const rollbackHolder = first.$transaction(async (tx) => {
      await acquireAdvisoryTransactionLock(tx, 2602003n);
      rollbackReady();
      await rollbackRelease;
      throw expectedRollback;
    });
    await rollbackLocked;
    const [blockedBeforeRollback] = await second.$queryRaw<
      Array<{ acquired: boolean }>
    >`SELECT pg_try_advisory_xact_lock(2602003::bigint) AS acquired`;
    requireCondition(
      !blockedBeforeRollback.acquired,
      'advisory lock must remain held until rollback',
    );
    releaseRollback();
    await rollbackHolder.catch((error: unknown) => {
      if (error !== expectedRollback) throw error;
    });
    const [releasedAfterRollback] = await second.$queryRaw<
      Array<{ acquired: boolean }>
    >`SELECT pg_try_advisory_xact_lock(2602003::bigint) AS acquired`;
    requireCondition(
      releasedAfterRollback.acquired,
      'rollback must release transaction advisory lock',
    );

    // Use a shared unlogged probe so both independent sessions see the same rows.
    await first.$executeRawUnsafe(
      'DROP TABLE IF EXISTS public.phase2_skip_locked_probe',
    );
    await first.$executeRawUnsafe(
      'CREATE UNLOGGED TABLE public.phase2_skip_locked_probe(id int primary key)',
    );
    await first.$executeRawUnsafe(
      'INSERT INTO public.phase2_skip_locked_probe VALUES (1),(2)',
    );
    let rowReady!: () => void;
    let releaseRow!: () => void;
    const locked = new Promise<void>((resolve) => (rowReady = resolve));
    const unlock = new Promise<void>((resolve) => (releaseRow = resolve));
    const rowHolder = first.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT id FROM public.phase2_skip_locked_probe WHERE id=1 FOR UPDATE',
      );
      rowReady();
      await unlock;
    });
    await locked;
    const rows = await second.$transaction((tx) =>
      tx.$queryRawUnsafe<Array<{ id: number }>>(
        'SELECT id FROM public.phase2_skip_locked_probe ORDER BY id FOR UPDATE SKIP LOCKED',
      ),
    );
    requireCondition(
      rows.length === 1 && rows[0].id === 2,
      'FOR UPDATE SKIP LOCKED must assign each unlocked row once',
    );
    releaseRow();
    await rowHolder;
    await first.$executeRawUnsafe('DROP TABLE public.phase2_skip_locked_probe');

    console.log(
      JSON.stringify(
        {
          status: 'compatible',
          target: describeDatabaseUrl(url),
          postgresMajor: 16,
          inventory,
          verified: [
            'roles',
            'extensions',
            'gen_random_uuid',
            'REL-016',
            'advisory-locks-two-sessions',
            'skip-locked-two-sessions',
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await Promise.allSettled([first.$disconnect(), second.$disconnect()]);
  }
}

if (require.main === module)
  validate().catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message
        : 'PostgreSQL portability validation failed',
    );
    process.exitCode = 1;
  });
