import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { connectionIdentity, loadConfig } from './config';
import { dumpPlan, restorePlan } from './plans';

const env = {
  CUTOVER_SOURCE_ADMIN_DATABASE_URL:
    'postgresql://user:secret@source.invalid:5432/app',
  CUTOVER_TARGET_ADMIN_DATABASE_URL:
    'postgresql://user:secret@target.invalid:5433/app',
  APP_ENV: 'test',
};
register(
  test('sanitizes connection identity and rejects equal targets', () => {
    assert.deepEqual(
      connectionIdentity(env.CUTOVER_SOURCE_ADMIN_DATABASE_URL),
      {
        scheme: 'postgresql',
        host: 'source.invalid',
        port: '5432',
        database: 'app',
      },
    );
    assert.throws(
      () =>
        loadConfig({
          ...env,
          CUTOVER_TARGET_ADMIN_DATABASE_URL:
            env.CUTOVER_SOURCE_ADMIN_DATABASE_URL,
        }),
      /MUST_DIFFER/,
    );
  }),
);
register(
  test('defaults to dry-run and creates safe plans without credentials', () => {
    const config = loadConfig(env);
    assert.equal(config.dryRun, true);
    assert.doesNotMatch(dumpPlan(config, 'x.dump').join(' '), /secret/);
    assert.ok(restorePlan(config, 'x.dump').includes('--exit-on-error'));
  }),
);
register(
  test('blocks protected environments without explicit confirmation', () =>
    assert.throws(
      () => loadConfig({ ...env, APP_ENV: 'production' }),
      /PROTECTED_ENVIRONMENT/,
    )),
);

function register(promise: Promise<unknown>) {
  void promise.catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
