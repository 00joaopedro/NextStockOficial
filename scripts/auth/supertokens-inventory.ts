import { readFile } from 'node:fs/promises';
import { inventory, PasswordHashRecord } from './supertokens-password-import';

export function buildInventory(records: PasswordHashRecord[]) {
  const base = inventory(records);
  const supabase = records.filter((r) => (r.legacyProvider ?? r.provider) === 'supabase').length;
  const st = records.filter((r) => (r.legacyProvider ?? r.provider) === 'supertokens').length;
  const linked = records.filter((r) => r.migrationState === 'linked').length;
  return { ...base, profiles: records.length, supabaseIdentities: supabase, superTokensIdentities: st,
    linkedIdentities: linked, unlinkedIdentities: Math.max(0, supabase - linked), legacySessions: 0,
    pendingReconciliation: records.filter((r) => r.migrationState === 'reconcile').length,
    canaryEligible: linked, pii: false as const };
}
async function main() {
  const path = process.argv.slice(2).find((v) => !v.startsWith('--'));
  const input = path ? JSON.parse(await readFile(path, 'utf8')) : { records: [] };
  const report = buildInventory((input.records ?? input) as PasswordHashRecord[]);
  console.log(JSON.stringify({ ...report, blockers: Object.keys(report.blockers).sort() }));
  if (Object.keys(report.blockers).length) process.exitCode = 1;
}
if (process.argv[1]?.endsWith('supertokens-inventory.js')) void main().catch(() => { console.error('inventory=blocked'); process.exitCode = 1; });
