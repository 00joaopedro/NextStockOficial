import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

export function parseJsonDocument(stdout, label) {
  const text = String(stdout ?? '');
  if (!text.trim()) throw new Error(`${label}: stdout is empty`);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label}: stdout is not exactly one JSON document`, {
      cause: error,
    });
  }
}

function run(label, args, env, expectedStatus) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  if (result.status !== expectedStatus) {
    throw new Error(
      `${label}: expected exit ${expectedStatus}, got ${result.status}; stderr=${JSON.stringify(result.stderr)}`,
    );
  }
  const report = parseJsonDocument(result.stdout, label);
  if (report.pii !== false) throw new Error(`${label}: pii must be false`);
  return report;
}

function assertBlocker(report, label, blocker) {
  if (
    (report.ready !== undefined && report.ready !== false) ||
    !report.blockerCodes?.includes(blocker)
  ) {
    throw new Error(`${label}: missing ${blocker}: ${JSON.stringify(report)}`);
  }
}

export function validateOperationalEvidence() {
  const dist = (name) => resolve('dist/scripts/auth', name);
  const inventory = run(
    'inventory without source',
    [dist('supertokens-inventory.js'), '--json'],
    {},
    1,
  );
  assertBlocker(
    inventory,
    'inventory without source',
    'INVENTORY_SOURCE_REQUIRED',
  );

  const reconcile = run(
    'reconcile without source',
    [dist('supertokens-reconcile.js'), '--dry-run', '--json'],
    {},
    1,
  );
  if (reconcile.dryRun !== true || reconcile.mutations !== 0)
    throw new Error('reconcile without source: mutation contract violated');
  assertBlocker(
    reconcile,
    'reconcile without source',
    'RECONCILIATION_SOURCE_REQUIRED',
  );

  const preflight = run(
    'preflight with unchecked Core',
    [dist('supertokens-preflight.js'), '--json'],
    {
      AUTH_PROVIDER_MODE: 'coexistence',
      SUPERTOKENS_CONNECTION_URI: 'http://127.0.0.1:3567',
      SUPERTOKENS_API_KEY: 'ci-synthetic-supertokens-key',
      SUPERTOKENS_APP_NAME: 'nextstock-ci',
      SUPERTOKENS_API_DOMAIN: 'http://127.0.0.1',
      SUPERTOKENS_WEBSITE_DOMAIN: 'http://127.0.0.1',
      AUTH_PREFLIGHT_CORE_STATUS: 'not_checked',
      AUTH_PREFLIGHT_DATABASE_READY: 'true',
      AUTH_PREFLIGHT_FALLBACK_CONFIGURED: 'true',
      AUTH_PREFLIGHT_ROLLBACK_READY: 'true',
      AUTH_PREFLIGHT_RECOVERY_VALIDATED: 'true',
      AUTH_PREFLIGHT_OBSERVABILITY_READY: 'true',
    },
    1,
  );
  assertBlocker(
    preflight,
    'preflight with unchecked Core',
    'SUPERTOKENS_CORE_NOT_CHECKED',
  );
}

if (process.argv[1]?.endsWith('validate-supertokens-evidence.mjs')) {
  try {
    validateOperationalEvidence();
    console.log('SuperTokens evidence reports validated.');
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'evidence validation failed',
    );
    process.exitCode = 1;
  }
}
