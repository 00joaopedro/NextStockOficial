import { readEvidence } from './supertokens-evidence';

export function reconcileDryRun(pending: number) {
  if (!Number.isSafeInteger(pending) || pending < 0)
    throw new Error('RECONCILIATION_SOURCE_INVALID');
  return {
    dryRun: true,
    mutations: 0,
    pending,
    blockerCodes: pending > 0 ? ['AUTH_RECONCILIATION_REQUIRED'] : [],
    pii: false as const,
  };
}

async function main() {
  if (!process.argv.includes('--dry-run')) throw new Error('DRY_RUN_REQUIRED');
  const path = process.argv.find((v) => v.endsWith('.json'));
  if (!path) throw new Error('RECONCILIATION_SOURCE_REQUIRED');
  const evidence = await readEvidence(path);
  if (evidence.aggregates.reconciliationPending === undefined)
    throw new Error('RECONCILIATION_SOURCE_REQUIRED');
  console.log(
    JSON.stringify(reconcileDryRun(evidence.aggregates.reconciliationPending)),
  );
}
if (process.argv[1]?.endsWith('supertokens-reconcile.js'))
  void main().catch((error: unknown) => {
    console.error(
      JSON.stringify({
        dryRun: true,
        mutations: 0,
        blockerCodes: [(error as Error).message],
        pii: false,
      }),
    );
    process.exitCode = 1;
  });
