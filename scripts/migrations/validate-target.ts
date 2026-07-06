import 'dotenv/config';

function fail(message: string): never {
  throw new Error(`Migration target rejected: ${message}`);
}

const appEnv = process.env.APP_ENV || process.env.NODE_ENV || 'development';
const directUrl = process.env.DIRECT_URL;
const databaseUrl = process.env.DATABASE_URL;
const projectRef = process.env.SUPABASE_PROJECT_REF?.trim();
const productionRef = process.env.PRODUCTION_SUPABASE_PROJECT_REF?.trim();

if (!databaseUrl) fail('DATABASE_URL is missing.');
if (['staging', 'production'].includes(appEnv) && !directUrl) {
  fail('DIRECT_URL is required for controlled staging/production migrations.');
}
if (['staging', 'production'].includes(appEnv) && !productionRef) {
  fail('PRODUCTION_SUPABASE_PROJECT_REF is required.');
}

let target: URL;
try {
  target = new URL(directUrl || databaseUrl);
} catch {
  fail('DATABASE_URL or DIRECT_URL is invalid.');
}
if (['staging', 'production'].includes(appEnv)) {
  if (!projectRef) fail('SUPABASE_PROJECT_REF is required.');
  const identity = `${target.hostname}/${target.username}`.toLowerCase();
  if (!identity.includes(projectRef.toLowerCase())) {
    fail('DIRECT_URL does not match SUPABASE_PROJECT_REF.');
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

console.log(`Migration target validated for APP_ENV=${appEnv}.`);
