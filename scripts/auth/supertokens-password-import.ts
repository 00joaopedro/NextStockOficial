import { readFile } from 'node:fs/promises';

export type PasswordHashRecord = {
  provider: string;
  subject: string;
  email: string;
  passwordHash: string;
};

const BCRYPT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const ARGON2 = /^\$argon2(?:d|i|id)\$v=19\$m=\d+,t=\d+,p=\d+\$[^$]+\$[^$]+$/;

export function validatePasswordHash(hash: string): 'bcrypt' | 'argon2' {
  if (BCRYPT.test(hash)) return 'bcrypt';
  if (ARGON2.test(hash)) return 'argon2';
  throw new Error('UNSUPPORTED_PASSWORD_HASH');
}

export function validateRecord(record: PasswordHashRecord) {
  if (
    !record ||
    record.provider !== 'supabase' ||
    !record.subject ||
    !record.email
  ) {
    throw new Error('INVALID_SANITIZED_RECORD');
  }
  const algorithm = validatePasswordHash(record.passwordHash);
  return { algorithm };
}

export async function dryRunImport(path: string) {
  const input = JSON.parse(await readFile(path, 'utf8')) as unknown;
  if (!Array.isArray(input)) throw new Error('IMPORT_MUST_BE_ARRAY');
  const algorithms = { bcrypt: 0, argon2: 0 };
  for (const record of input) {
    const { algorithm } = validateRecord(record as PasswordHashRecord);
    algorithms[algorithm]++;
  }
  return { records: input.length, algorithms, mutations: 0, dryRun: true };
}

if (process.argv[1]?.endsWith('supertokens-password-import.ts')) {
  const path = process.argv[2];
  if (!path || process.argv[3] !== '--dry-run')
    throw new Error('DRY_RUN_REQUIRED');
  void dryRunImport(path)
    .then((report) => console.log(JSON.stringify(report)))
    .catch((_error: unknown) => {
      console.error('SuperTokens password import failed.');
      process.exitCode = 1;
    });
}
