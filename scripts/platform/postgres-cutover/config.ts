import { createHash, randomUUID } from 'node:crypto';

export type CutoverConfig = {
  sourceUrl: string;
  targetUrl: string;
  dryRun: boolean;
  allowProduction: boolean;
  confirmationToken?: string;
  reportPath?: string;
  timeoutMs: number;
};

export type ConnectionIdentity = {
  scheme: string;
  host: string;
  port: string;
  database: string;
};

export function connectionIdentity(value: string): ConnectionIdentity {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('CUTOVER_DATABASE_URL_INVALID');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol))
    throw new Error('CUTOVER_DATABASE_URL_PROTOCOL');
  return {
    scheme: 'postgresql',
    host: parsed.hostname,
    port: parsed.port || '5432',
    database: parsed.pathname.slice(1) || 'unknown',
  };
}

export function sanitizeConnection(value: string): ConnectionIdentity {
  return connectionIdentity(value);
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): CutoverConfig {
  const sourceUrl = env.CUTOVER_SOURCE_ADMIN_DATABASE_URL;
  const targetUrl = env.CUTOVER_TARGET_ADMIN_DATABASE_URL;
  if (!sourceUrl || !targetUrl)
    throw new Error('CUTOVER_SOURCE_AND_TARGET_REQUIRED');
  const source = connectionIdentity(sourceUrl);
  const target = connectionIdentity(targetUrl);
  if (
    source.host === target.host &&
    source.port === target.port &&
    source.database === target.database
  )
    throw new Error('CUTOVER_SOURCE_TARGET_MUST_DIFFER');
  const appEnv = (env.APP_ENV || env.NODE_ENV || 'development').toLowerCase();
  const allowProduction = env.CUTOVER_ALLOW_PRODUCTION === 'true';
  if (['production', 'staging'].includes(appEnv) && !allowProduction)
    throw new Error('CUTOVER_PROTECTED_ENVIRONMENT');
  if (
    allowProduction &&
    env.CUTOVER_CONFIRMATION_TOKEN !== 'CONFIRM_OFFLINE_CUTOVER'
  )
    throw new Error('CUTOVER_CONFIRMATION_REQUIRED');
  return {
    sourceUrl,
    targetUrl,
    dryRun: env.CUTOVER_DRY_RUN !== 'false',
    allowProduction,
    confirmationToken: env.CUTOVER_CONFIRMATION_TOKEN,
    reportPath: env.CUTOVER_REPORT_PATH,
    timeoutMs: safeInt(env.CUTOVER_TIMEOUT_MS, 120_000),
  };
}

export function runId() {
  return randomUUID();
}
export function fingerprint(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}
function safeInt(value: string | undefined, fallback: number) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}
