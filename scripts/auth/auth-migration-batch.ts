import { readFile } from 'node:fs/promises';

type SanitizedRecord = {
  sourceProvider?: string;
  sourceSubject?: string;
  profileId?: string;
};

const allowedProviders = new Set(['supabase', 'supertokens']);

export async function planBatch(records: SanitizedRecord[], batchSize: number) {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 100)
    throw new Error('INVALID_BATCH_SIZE');
  const selected = records.slice(0, batchSize);
  return {
    mode: 'dry-run',
    dryRun: true,
    scanned: selected.length,
    eligible: selected.filter(
      (item) =>
        allowedProviders.has(item.sourceProvider || '') &&
        Boolean(item.sourceSubject) &&
        Boolean(item.profileId),
    ).length,
    migrated: 0,
    alreadyMigrated: 0,
    skipped: selected.filter((item) => !allowedProviders.has(item.sourceProvider || '')).length,
    conflicted: 0,
    failed: 0,
    unknown: 0,
    cursor: selected.length,
    mutations: 0,
  };
}

async function main() {
  if (process.env.AUTH_MIGRATION_BATCH_ENABLED !== 'true') throw new Error('BATCH_DISABLED');
  if (process.env.AUTH_MIGRATION_DRY_RUN !== 'true' || process.argv.includes('--apply')) throw new Error('DRY_RUN_REQUIRED');
  const path = process.argv.find((argument) => argument.endsWith('.json'));
  if (!path) throw new Error('SANITIZED_INPUT_REQUIRED');
  const input = JSON.parse(await readFile(path, 'utf8')) as unknown;
  if (!Array.isArray(input)) throw new Error('SANITIZED_INPUT_INVALID');
  const report = await planBatch(input as SanitizedRecord[], Number(process.env.AUTH_MIGRATION_BATCH_SIZE || 20));
  console.log(JSON.stringify(report));
}

if (process.argv[1]?.endsWith('auth-migration-batch.ts'))
  void main().catch(() => { console.error('auth-migration-batch=blocked'); process.exitCode = 1; });
