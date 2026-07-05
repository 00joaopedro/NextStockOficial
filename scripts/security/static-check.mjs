import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean);
const failures = [];

for (const file of files) {
  if (
    /(^|\/)\.env($|\.)/.test(file) &&
    !file.endsWith('.example')
  ) {
    failures.push(`tracked environment file: ${file}`);
  }
  if (/\.(pfx|p12|pem|key|dump|sql\.gz)$/i.test(file)) {
    failures.push(`tracked secret/backup artifact: ${file}`);
  }
  if (!/\.(ts|js|mjs|cjs|html)$/i.test(file)) continue;
  const source = readFileSync(file, 'utf8');
  if (
    file.startsWith('src/') &&
    /\$(?:queryRawUnsafe|executeRawUnsafe)\s*\(/.test(source)
  ) {
    failures.push(`unsafe Prisma raw query in runtime source: ${file}`);
  }
  if (
    file.startsWith('public/') &&
    /(?:localStorage|sessionStorage)\.setItem\(\s*['"][^'"]*(?:jwt|token|access.?token)/i.test(
      source,
    )
  ) {
    failures.push(`browser token persistence: ${file}`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Static security checks passed.');
