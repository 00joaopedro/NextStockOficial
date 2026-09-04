import { createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export type SanitizedRecord = {
  sourceProvider?: string;
  sourceSubject?: string;
  profileId?: string;
};
const providers = new Set(['supabase', 'supertokens']);
const version = 1;

function key(record: SanitizedRecord) {
  return createHash('sha256')
    .update(
      `${record.sourceProvider || ''}\0${record.sourceSubject || ''}\0${record.profileId || ''}`,
    )
    .digest('hex');
}
function signature(value: string) {
  const secret = process.env.AUTH_MIGRATION_CURSOR_SECRET?.trim();
  if (!secret) throw new Error('CURSOR_SECRET_REQUIRED');
  return createHmac('sha256', secret)
    .update(`${version}:${value}`)
    .digest('base64url');
}
function encode(value: string) {
  return Buffer.from(
    JSON.stringify({ v: version, k: value, s: signature(value) }),
  ).toString('base64url');
}
function decode(cursor: string, keys: Set<string>) {
  try {
    const value = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as { v?: number; k?: string; s?: string };
    if (
      value.v !== version ||
      !value.k ||
      !value.s ||
      !/^[a-f0-9]{64}$/.test(value.k) ||
      value.s !== signature(value.k) ||
      !keys.has(value.k)
    )
      throw new Error('INVALID_CURSOR');
    return value.k;
  } catch {
    throw new Error('INVALID_CURSOR');
  }
}

export function planBatch(
  records: SanitizedRecord[],
  batchSize: number,
  cursor?: string,
) {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 100)
    throw new Error('INVALID_BATCH_SIZE');
  const ordered = [...records].sort((a, b) => key(a).localeCompare(key(b)));
  const keys = new Set(ordered.map(key));
  if (keys.size !== ordered.length) throw new Error('DUPLICATE_RECORD_KEY');
  const last = cursor ? decode(cursor, keys) : undefined;
  const start = last
    ? ordered.findIndex((record) => key(record) === last) + 1
    : 0;
  const selected = ordered.slice(start, start + batchSize);
  const eligible = selected.filter(
    (item) =>
      providers.has(item.sourceProvider || '') &&
      Boolean(item.sourceSubject) &&
      Boolean(item.profileId),
  );
  return {
    mode: 'dry-run',
    dryRun: true,
    scanned: selected.length,
    eligible: eligible.length,
    migrated: 0,
    alreadyMigrated: 0,
    skipped: selected.length - eligible.length,
    conflicted: 0,
    failed: 0,
    unknown: 0,
    cursor: selected.length
      ? encode(key(selected[selected.length - 1]))
      : cursor || null,
    mutations: 0,
  };
}

async function main() {
  if (process.env.AUTH_MIGRATION_BATCH_ENABLED !== 'true')
    throw new Error('BATCH_DISABLED');
  if (
    process.env.AUTH_MIGRATION_DRY_RUN !== 'true' ||
    process.argv.includes('--apply')
  )
    throw new Error('DRY_RUN_REQUIRED');
  const path = process.argv.find((argument) => argument.endsWith('.json'));
  if (!path) throw new Error('SANITIZED_INPUT_REQUIRED');
  const input = JSON.parse(await readFile(path, 'utf8')) as unknown;
  if (!Array.isArray(input)) throw new Error('SANITIZED_INPUT_INVALID');
  const index = process.argv.indexOf('--cursor');
  const cursor = index >= 0 ? process.argv[index + 1] : undefined;
  console.log(
    JSON.stringify(
      planBatch(
        input as SanitizedRecord[],
        Number(process.env.AUTH_MIGRATION_BATCH_SIZE || 20),
        cursor,
      ),
    ),
  );
}
if (process.argv[1]?.endsWith('auth-migration-batch.ts'))
  void main().catch(() => {
    console.error('auth-migration-batch=blocked');
    process.exitCode = 1;
  });
