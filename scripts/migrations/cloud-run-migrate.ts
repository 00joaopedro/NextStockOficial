import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { validateMigrationTarget } from './validate-target-lib';

if (process.env.NEXTSTOCK_PROCESS_ROLE && process.env.NEXTSTOCK_PROCESS_ROLE !== 'migration') {
  throw new Error('Migration job cannot run with an application process role');
}
if (!process.env.DIRECT_URL && !process.env.ADMIN_DATABASE_URL) throw new Error('DIRECT_URL or ADMIN_DATABASE_URL is required');
const url = process.env.ADMIN_DATABASE_URL || process.env.DIRECT_URL || '';
if (/:6543(?:\/|\?|$)/.test(url) || /pgbouncer/i.test(url)) throw new Error('Migration target must not be a pooler URL');
const result = validateMigrationTarget({ ...process.env, DATABASE_URL: url });
console.log(`Migration target validated for APP_ENV=${result.appEnv} (${result.targetDescription}).`);
execFileSync('npx', ['prisma', 'migrate', 'deploy'], { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
execFileSync('npx', ['prisma', 'migrate', 'status'], { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
