import { readEvidence } from './supertokens-evidence';
import { inventory, PasswordHashRecord } from './supertokens-password-import';

export function buildInventory(
  records: PasswordHashRecord[],
  legacySessions: number,
) {
  if (!Number.isSafeInteger(legacySessions) || legacySessions < 0)
    throw new Error('LEGACY_SESSION_COUNT_UNPROVEN');
  const base = inventory(records);
  const supabase = records.filter(
    (r) => (r.legacyProvider ?? r.provider) === 'supabase',
  ).length;
  const superTokens = records.filter(
    (r) => (r.legacyProvider ?? r.provider) === 'supertokens',
  ).length;
  const linked = records.filter((r) => r.migrationState === 'linked').length;
  return {
    ...base,
    profiles: records.length,
    supabaseIdentities: supabase,
    superTokensIdentities: superTokens,
    linkedIdentities: linked,
    unlinkedIdentities: Math.max(0, supabase - linked),
    legacySessions,
    pendingReconciliation: records.filter(
      (r) => r.migrationState === 'reconcile',
    ).length,
    canaryEligible: linked,
    pii: false as const,
  };
}

export async function loadInventory(path: string) {
  const evidence = await readEvidence(path);
  return buildInventory(evidence.records, evidence.aggregates.legacySessions);
}

async function main() {
  const path = process.argv.slice(2).find((v) => !v.startsWith('--'));
  if (!path) throw new Error('INVENTORY_SOURCE_REQUIRED');
  const report = await loadInventory(path);
  console.log(
    JSON.stringify({
      ...report,
      blockers: Object.keys(report.blockers).sort(),
    }),
  );
  if (Object.keys(report.blockers).length) process.exitCode = 1;
}
if (process.argv[1]?.endsWith('supertokens-inventory.js'))
  void main().catch((error: unknown) => {
    console.error(
      JSON.stringify({
        ready: false,
        blockerCodes: [(error as Error).message],
        pii: false,
      }),
    );
    process.exitCode = 1;
  });
