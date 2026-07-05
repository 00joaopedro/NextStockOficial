import { createHash } from 'crypto';
import { createReadStream, statSync } from 'fs';

async function main() {
  const file = process.env.BACKUP_FILE;
  const expected = process.env.BACKUP_SHA256?.toLowerCase();
  if (!file || !expected) {
    throw new Error('BACKUP_FILE and BACKUP_SHA256 are required.');
  }
  const stat = statSync(file);
  if (!stat.isFile() || stat.size <= 0)
    throw new Error('Backup file is empty.');
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', resolve);
  });
  const actual = hash.digest('hex');
  if (actual !== expected) throw new Error('Backup checksum mismatch.');
  console.log(JSON.stringify({ ok: true, bytes: stat.size, sha256: actual }));
}

void main();
