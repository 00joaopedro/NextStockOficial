import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const output = 'dist/scripts';
const required = [
  `${output}/migrations/validate-target.js`,
  `${output}/migrations/validate-target-lib.js`,
  `${output}/lib/admin-database-url.js`,
];
for (const file of required) {
  if (!existsSync(file)) throw new Error(`Missing compiled migration artifact: ${file}`);
}
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
if (packageJson.scripts['railway:migrate'] !== 'node dist/scripts/migrations/validate-target.js && prisma migrate deploy') {
  throw new Error('railway:migrate must execute the compiled validator before Prisma');
}
const result = spawnSync(process.execPath, ['dist/scripts/migrations/validate-target.js'], {
  env: { ...process.env, APP_ENV: 'production', DATABASE_URL: 'not-a-database-url', DIRECT_URL: '' },
  encoding: 'utf8',
});
if (result.status === 0 || /postgres(?:ql)?:\/\//i.test(`${result.stdout}\n${result.stderr}`)) {
  throw new Error('Invalid migration target did not fail safely before external access');
}
console.log('Compiled migration runtime verified');
