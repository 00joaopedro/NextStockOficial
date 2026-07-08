import {
  assertAdministrativeDatabaseUrlMatchesProjectRef,
  describeDatabaseUrl,
  selectAdministrativeDatabaseUrl,
} from '../lib/admin-database-url';

type Env = Record<string, string | undefined>;

function fail(message: string): never {
  throw new Error(`Migration target rejected: ${message}`);
}

export function validateMigrationTarget(env: Env) {
  const appEnv = env.APP_ENV || env.NODE_ENV || 'development';
  const adminUrl = env.ADMIN_DATABASE_URL;
  const directUrl = env.DIRECT_URL;
  const databaseUrl = env.DATABASE_URL;
  const projectRef = env.SUPABASE_PROJECT_REF?.trim();
  const productionRef = env.PRODUCTION_SUPABASE_PROJECT_REF?.trim();

  if (!databaseUrl) fail('DATABASE_URL is missing.');
  if (['staging', 'production'].includes(appEnv) && !adminUrl && !directUrl) {
    fail(
      'DIRECT_URL or ADMIN_DATABASE_URL is required for controlled staging/production migrations.',
    );
  }
  if (['staging', 'production'].includes(appEnv) && !productionRef) {
    fail('PRODUCTION_SUPABASE_PROJECT_REF is required.');
  }

  let target: string;
  try {
    target = selectAdministrativeDatabaseUrl(env);
  } catch (error) {
    fail(
      error instanceof Error
        ? error.message
        : 'Administrative database URL is invalid.',
    );
  }

  if (['staging', 'production'].includes(appEnv)) {
    try {
      assertAdministrativeDatabaseUrlMatchesProjectRef({
        url: target,
        projectRef,
      });
    } catch (error) {
      fail(
        error instanceof Error
          ? error.message
          : 'SUPABASE_PROJECT_REF mismatch.',
      );
    }
  }

  if (appEnv === 'staging') {
    if (projectRef === productionRef) {
      fail('staging cannot target the production Supabase project.');
    }
  }

  if (appEnv === 'production') {
    if (projectRef !== productionRef) {
      fail('production project ref is not explicitly approved.');
    }
  }

  return {
    appEnv,
    targetDescription: describeDatabaseUrl(target),
  };
}
