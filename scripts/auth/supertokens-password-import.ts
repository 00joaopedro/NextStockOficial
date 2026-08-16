import { readFile, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export type PasswordHashRecord = {
  legacyProvider?: string;
  legacySubject?: string;
  canonicalEmail?: string;
  provider?: string;
  subject?: string;
  email?: string;
  passwordHash?: string;
  passwordStrategy?: 'import_hash' | 'migrate_on_login' | 'reset_required';
  migrationState?: 'pending' | 'linked' | 'blocked' | 'reconcile';
  plannedResult?: string;
  tenantId?: string;
  branchId?: string;
  roles?: string[];
};

const BCRYPT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const ARGON2 = /^\$argon2(?:d|i|id)\$v=19\$m=\d+,t=\d+,p=\d+\$[^$]+\$[^$]+$/;

export function validatePasswordHash(hash: string): 'bcrypt' | 'argon2' {
  if (BCRYPT.test(hash)) return 'bcrypt';
  if (ARGON2.test(hash)) return 'argon2';
  throw new Error('UNSUPPORTED_PASSWORD_HASH');
}

export function validateRecord(record: PasswordHashRecord) {
  const provider = record?.legacyProvider ?? record?.provider;
  const subject = record?.legacySubject ?? record?.subject;
  const email = record?.canonicalEmail ?? record?.email;
  if (
    !record ||
    provider !== 'supabase' ||
    !subject ||
    !email ||
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
  ) {
    throw new Error('INVALID_SANITIZED_RECORD');
  }
  const strategy =
    record.passwordStrategy ?? (record.provider ? 'import_hash' : undefined);
  if (!strategy) throw new Error('PASSWORD_STRATEGY_MISSING');
  const algorithm =
    strategy === 'import_hash'
      ? validatePasswordHash(record.passwordHash || '')
      : undefined;
  return { algorithm };
}

export function inventory(records: PasswordHashRecord[]) {
  const states: Record<string, number> = {};
  const blockers: Record<string, number> = {};
  const emails = new Set<string>();
  const subjects = new Set<string>();
  for (const record of records) {
    const state = record.migrationState || 'pending';
    states[state] = (states[state] || 0) + 1;
    const email = record.canonicalEmail ?? record.email ?? '';
    const subject = `${record.legacyProvider ?? record.provider}:${record.legacySubject ?? record.subject}`;
    if (emails.has(email))
      blockers.DUPLICATE_CANONICAL_EMAIL =
        (blockers.DUPLICATE_CANONICAL_EMAIL || 0) + 1;
    if (subjects.has(subject))
      blockers.DUPLICATE_SUBJECT = (blockers.DUPLICATE_SUBJECT || 0) + 1;
    emails.add(email);
    subjects.add(subject);
    try {
      validateRecord(record);
    } catch (error) {
      const code = (error as Error).message;
      blockers[code] = (blockers[code] || 0) + 1;
    }
  }
  return {
    formatVersion: 1,
    records: records.length,
    states,
    blockers,
    pii: false,
    mutations: 0,
  };
}

export async function loadRehearsal(path: string) {
  const parsed = JSON.parse(await readFile(path, 'utf8')) as {
    formatVersion?: number;
    records?: PasswordHashRecord[];
  };
  if (parsed.formatVersion !== 1 || !Array.isArray(parsed.records))
    throw new Error('UNSUPPORTED_REHEARSAL_FORMAT');
  return parsed.records;
}

export async function dryRunRehearsal(path: string) {
  const records = await loadRehearsal(path);
  const report = inventory(records);
  if (Object.keys(report.blockers).length) throw new Error('REHEARSAL_BLOCKED');
  return { ...report, mode: 'dry-run' };
}

export async function writeCheckpoint(path: string, ids: string[]) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(
    temporary,
    JSON.stringify({ formatVersion: 1, completed: [...new Set(ids)] }) + '\n',
    { mode: 0o600 },
  );
  await rename(temporary, path);
}

export async function dryRunImport(path: string) {
  const input = JSON.parse(await readFile(path, 'utf8')) as unknown;
  if (!Array.isArray(input)) throw new Error('IMPORT_MUST_BE_ARRAY');
  const algorithms = { bcrypt: 0, argon2: 0 };
  for (const record of input) {
    const { algorithm } = validateRecord(record as PasswordHashRecord);
    if (algorithm) algorithms[algorithm]++;
  }
  return { records: input.length, algorithms, mutations: 0, dryRun: true };
}

if (process.argv[1]?.endsWith('supertokens-password-import.ts')) {
  const path = process.argv[2];
  const mode = process.argv[3];
  if (!path || !['--inventory', '--dry-run'].includes(mode))
    throw new Error('OFFLINE_MODE_REQUIRED');
  void (
    mode === '--inventory'
      ? loadRehearsal(path).then(inventory)
      : dryRunRehearsal(path)
  )
    .then((report) => console.log(JSON.stringify(report)))
    .catch(() => {
      console.error('SuperTokens password import failed.');
      process.exitCode = 1;
    });
}
