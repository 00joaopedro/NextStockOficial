import { readFile } from 'node:fs/promises';
import { buildInventory } from './supertokens-inventory';
import { PasswordHashRecord, validateRecord } from './supertokens-password-import';
export function createMigrationPlan(records: PasswordHashRecord[]) {
  const actions = records.map((r) => { const { algorithm } = validateRecord(r); return r.migrationState === 'linked' ? 'verify' : `link_after_authentication:${algorithm ?? r.passwordStrategy}`; });
  return { formatVersion: 1, mode: 'dry-run', dryRun: true, actions: actions.reduce<Record<string, number>>((a, x) => { a[x] = (a[x] ?? 0) + 1; return a; }, {}), inventory: buildInventory(records), checkpoint: { completed: 0, idempotency: 'provider_subject' }, mutations: 0, pii: false };
}
async function main() { if (!process.argv.includes('--dry-run')) throw new Error('DRY_RUN_REQUIRED'); const path = process.argv.find((v) => v.endsWith('.json')); if (!path) throw new Error('SANITIZED_INPUT_REQUIRED'); const input = JSON.parse(await readFile(path, 'utf8')); console.log(JSON.stringify(createMigrationPlan((input.records ?? input) as PasswordHashRecord[]))); }
if (process.argv[1]?.endsWith('supertokens-migration-plan.js')) void main().catch(() => { console.error('migration-plan=blocked'); process.exitCode = 1; });
