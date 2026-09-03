import * as Joi from 'joi';
import { assertLocalJwtConfigured } from '../auth/local-jwt-config';

const schema = Joi.object({
  NEXTSTOCK_PROCESS_ROLE: Joi.string()
    .valid('api', 'audit-worker', 'all')
    .default('all'),
  GCP_PROJECT_ID: Joi.string().allow('').optional(),
  GCP_REGION: Joi.string().allow('').optional(),
  CLOUD_RUN_SERVICE: Joi.string().allow('').optional(),
  CLOUD_SQL_INSTANCE_CONNECTION_NAME: Joi.string().allow('').optional(),
  CLOUD_SQL_CONNECTOR_MODE: Joi.string()
    .valid('off', 'socket', 'connector')
    .default('off'),
  CLOUD_SQL_DATABASE: Joi.string().allow('').optional(),
  AUDIT_OUTBOX_WORKER_ENABLED: Joi.string()
    .valid('true', 'false')
    .default('true'),
  AUDIT_OUTBOX_BATCH_SIZE: Joi.number().integer().min(1).max(100).default(20),
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  APP_ENV: Joi.string()
    .valid('development', 'test', 'staging', 'production')
    .optional(),
  AUTH_PROVIDER: Joi.string().valid('supabase').default('supabase'),
  GOOGLE_OAUTH_ENABLED: Joi.string().valid('true', 'false').default('false'),
  GOOGLE_OAUTH_CLIENT_ID: Joi.string().allow('').optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: Joi.string().allow('').optional(),
  GOOGLE_OAUTH_CALLBACK_URL: Joi.string().uri().allow('').optional(),
  AUTH_PROVIDER_MODE: Joi.string()
    .valid(
      'supabase_only',
      'coexistence',
      'supertokens_primary',
      'supertokens_only',
      'local_primary',
      'local_only',
    )
    .default('supabase_only'),
  AUTH_MIGRATION_ENABLED: Joi.string().valid('true', 'false').default('false'),
  AUTH_LEGACY_FALLBACK_ENABLED: Joi.string()
    .valid('true', 'false')
    .default('true'),
  LOCAL_AUTH_JWT_ACTIVE_KEY: Joi.string().min(32).allow('').optional(),
  LOCAL_AUTH_JWT_PREVIOUS_KEY: Joi.string().min(32).allow('').optional(),
  LOCAL_AUTH_JWT_KID: Joi.string().max(80).allow('').optional(),
  LOCAL_AUTH_JWT_PREVIOUS_KID: Joi.string().max(80).allow('').optional(),
  LOCAL_AUTH_JWT_ISSUER: Joi.string().allow('').optional(),
  LOCAL_AUTH_JWT_AUDIENCE: Joi.string().allow('').optional(),
  LOCAL_AUTH_JWT_TTL_SECONDS: Joi.number()
    .integer()
    .min(60)
    .max(900)
    .default(300),
  LOCAL_BCRYPT_ROUNDS: Joi.number().integer().min(10).max(14).default(12),
  SUPERTOKENS_CONNECTION_URI: Joi.string().uri().allow('').optional(),
  SUPERTOKENS_API_KEY: Joi.string().allow('').optional(),
  SUPERTOKENS_APP_NAME: Joi.string().allow('').optional(),
  SUPERTOKENS_API_DOMAIN: Joi.string().uri().allow('').optional(),
  SUPERTOKENS_WEBSITE_DOMAIN: Joi.string().uri().allow('').optional(),
  STORAGE_WRITE_PROVIDER: Joi.string()
    .valid('SUPABASE', 'GCS', 'supabase', 'gcs')
    .default('supabase'),
  GCS_STORAGE_ENABLED: Joi.string().valid('true', 'false').default('false'),
  GCS_PROJECT_ID: Joi.string().allow('').optional(),
  GCS_STORAGE_BUCKET: Joi.string().allow('').optional(),
  GCS_STORAGE_LOCATION: Joi.string().allow('').optional(),
  GCS_SIGNED_URL_TTL_SECONDS: Joi.number()
    .integer()
    .min(1)
    .max(3600)
    .default(300),
  STORAGE_MIGRATION_ENABLED: Joi.string()
    .valid('true', 'false')
    .default('false'),
  STORAGE_MIGRATION_CONCURRENCY: Joi.number()
    .integer()
    .min(1)
    .max(4)
    .default(1),
  STORAGE_MIGRATION_BATCH_SIZE: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20),
  STORAGE_MIGRATION_LEASE_SECONDS: Joi.number()
    .integer()
    .min(1)
    .max(3600)
    .default(60),
  DATABASE_URL: Joi.string().required(),
  DIRECT_URL: Joi.string().allow('').optional(),
  ADMIN_DATABASE_URL: Joi.string().allow('').optional(),
  SUPABASE_URL: Joi.string()
    .uri({ scheme: ['https', 'http'] })
    .required(),
  SUPABASE_ANON_KEY: Joi.string().min(20).allow('').optional(),
  SUPABASE_PUBLISHABLE_KEY: Joi.string().min(20).allow('').optional(),
  SUPABASE_SERVICE_ROLE_KEY: Joi.string().min(20).required(),
  SUPABASE_JWT_SECRET: Joi.string().min(20).allow('').optional(),
  SUPABASE_PROJECT_REF: Joi.string().allow('').optional(),
  PRODUCTION_SUPABASE_PROJECT_REF: Joi.string().allow('').optional(),
  STAGING_SUPABASE_PROJECT_REF: Joi.string().allow('').optional(),
  PRODUCTION_APP_HOST: Joi.string().allow('').optional(),
  CORS_ALLOWED_ORIGINS: Joi.string().allow('').optional(),
  PUBLIC_APP_URL: Joi.string()
    .uri({ scheme: ['https', 'http'] })
    .allow('')
    .optional(),
  LOCAL_PASSWORD_RECOVERY_ENABLED: Joi.string()
    .valid('true', 'false')
    .default('false'),
  BILLING_EXTERNAL_REFERENCE_SECRET: Joi.string().min(32).allow('').optional(),
  BILLING_ENFORCEMENT_ENABLED: Joi.string().valid('true', 'false').optional(),
  BILLING_CHECKOUT_ENABLED: Joi.string().valid('true', 'false').optional(),
  BILLING_WEBHOOK_ENABLED: Joi.string().valid('true', 'false').optional(),
  BILLING_DEFAULT_PROVIDER: Joi.string()
    .valid('MERCADO_PAGO', 'mercado_pago')
    .optional(),
  BILLING_MODE: Joi.string().valid('sandbox', 'test', 'production').optional(),
  MERCADO_PAGO_WEBHOOK_SECRET: Joi.string().min(16).allow('').optional(),
  MERCADO_PAGO_ACCESS_TOKEN: Joi.string().allow('').optional(),
  MERCADO_PAGO_COLLECTOR_ID: Joi.string().allow('').optional(),
  MERCADO_PAGO_CLIENT_ID: Joi.string().allow('').optional(),
  MERCADO_PAGO_CLIENT_SECRET: Joi.string().allow('').optional(),
  MERCADO_PAGO_OAUTH_REDIRECT_URI: Joi.string()
    .uri({ scheme: ['https', 'http'] })
    .allow('')
    .optional(),
  MERCADO_PAGO_APP_WEBHOOK_SECRET: Joi.string().min(16).allow('').optional(),
  PAYMENT_CREDENTIALS_ENCRYPTION_KEY: Joi.string()
    .base64()
    .allow('')
    .optional(),
  PAYMENT_CREDENTIALS_KEY_VERSION: Joi.string().max(40).allow('').optional(),
  MERCADO_PAGO_PLAN_ID_OURO: Joi.string().allow('').optional(),
  MERCADO_PAGO_PLAN_ID_ESMERALDA: Joi.string().allow('').optional(),
  MERCADO_PAGO_PLAN_ID_DIAMANTE: Joi.string().allow('').optional(),
  CERT_ENCRYPTION_KEY: Joi.string().base64().allow('').optional(),
  CERT_ENCRYPTION_KEY_VERSION: Joi.string().max(32).allow('').optional(),
  CSP_ENFORCE: Joi.string().valid('true', 'false').optional(),
  CSP_REPORT_ONLY: Joi.string().valid('true', 'false').optional(),
  MERCADO_PAGO_MODE: Joi.string()
    .valid('sandbox', 'test', 'production')
    .optional(),
  AUDIT_HASH_SECRET: Joi.string().min(32).allow('').optional(),
  AUDIT_OUTBOX_ALERTING_ENABLED: Joi.string()
    .valid('true', 'false')
    .default('true'),
  AUDIT_OUTBOX_BACKLOG_ALERT_THRESHOLD: Joi.number()
    .integer()
    .min(1)
    .default(100),
  AUDIT_OUTBOX_LAG_SLA_SECONDS: Joi.number().integer().min(1).default(300),
  AUDIT_OUTBOX_SHUTDOWN_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1)
    .default(10000),
  AUDIT_OUTBOX_ALERT_COOLDOWN_SECONDS: Joi.number()
    .integer()
    .min(1)
    .default(300),
  SESSION_HASH_SECRET: Joi.string().min(32).allow('').optional(),
  SESSION_ENFORCEMENT_ENABLED: Joi.string().valid('true', 'false').optional(),
  STOREFRONT_PUBLIC_READ_ENABLED: Joi.string()
    .valid('true', 'false')
    .default('false'),
  STOREFRONT_ORDERING_ENABLED: Joi.string()
    .valid('true', 'false')
    .default('false'),
  STOREFRONT_TOKEN_SECRET: Joi.string().min(32).allow('').optional(),
  DASHBOARD_CACHE_MODE: Joi.string()
    .valid('auto', 'local', 'disabled')
    .default('auto'),
  DASHBOARD_CACHE_SINGLE_REPLICA: Joi.string()
    .valid('true', 'false')
    .default('false'),
  DASHBOARD_CACHE_TTL_MS: Joi.number()
    .integer()
    .min(100)
    .max(30000)
    .default(5000),
  DASHBOARD_CACHE_INVALIDATION_SLA_MS: Joi.number()
    .integer()
    .min(100)
    .max(30000)
    .default(5000),
  DASHBOARD_CACHE_MAX_ENTRIES: Joi.number()
    .integer()
    .min(1)
    .max(10000)
    .default(500),
  AUTH_RATE_LIMIT_ENABLED: Joi.string().valid('true', 'false').default('true'),
  AUTH_RATE_LIMIT_STORE: Joi.string().valid('postgres').default('postgres'),
  AUTH_RATE_LIMIT_HMAC_SECRET: Joi.string().min(32).allow('').optional(),
  TRUSTED_PROXY_HOPS: Joi.number().integer().min(0).max(10).default(0),
  READINESS_DATABASE_TIMEOUT_MS: Joi.number()
    .integer()
    .min(250)
    .max(5000)
    .default(2000),
  IMAGE_PROCESSING_CONCURRENCY: Joi.number().integer().min(1).max(4).default(1),
  IMAGE_PROCESSING_MAX_QUEUE: Joi.number().integer().min(1).max(100).default(4),
  IMAGE_PROCESSING_QUEUE_TIMEOUT_MS: Joi.number()
    .integer()
    .min(100)
    .max(120000)
    .default(15000),
  IMAGE_PROCESSING_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1000)
    .max(120000)
    .default(30000),
  IMAGE_PROCESSING_PER_TENANT: Joi.number().integer().min(1).max(4).default(1),
  IMAGE_MAX_INPUT_PIXELS: Joi.number()
    .integer()
    .min(1)
    .max(40000000)
    .default(20000000),
}).unknown(true);

export function validateEnvironment(env: NodeJS.ProcessEnv) {
  const { error, value } = schema.validate(env, {
    abortEarly: false,
    allowUnknown: true,
    stripUnknown: false,
  });
  if (error) {
    throw new Error(
      `Invalid environment configuration: ${error.details.map((d) => d.path.join('.')).join(', ')}`,
    );
  }
  if (
    value.DASHBOARD_CACHE_TTL_MS > value.DASHBOARD_CACHE_INVALIDATION_SLA_MS
  ) {
    throw new Error(
      'Invalid environment configuration: DASHBOARD_CACHE_TTL_MS exceeds DASHBOARD_CACHE_INVALIDATION_SLA_MS',
    );
  }
  if (value.IMAGE_PROCESSING_PER_TENANT > value.IMAGE_PROCESSING_CONCURRENCY) {
    throw new Error(
      'Invalid environment configuration: IMAGE_PROCESSING_PER_TENANT exceeds IMAGE_PROCESSING_CONCURRENCY',
    );
  }
  if (
    String(value.AUTH_RATE_LIMIT_ENABLED).toLowerCase() === 'true' &&
    String(value.AUTH_RATE_LIMIT_HMAC_SECRET || '').length < 32
  ) {
    throw new Error(
      'Missing required environment variable: AUTH_RATE_LIMIT_HMAC_SECRET',
    );
  }
  if (
    !String(value.SUPABASE_ANON_KEY || '').trim() &&
    !String(value.SUPABASE_PUBLISHABLE_KEY || '').trim()
  ) {
    throw new Error(
      'Missing required environment variable: SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY',
    );
  }
  const appEnv = String(value.APP_ENV || value.NODE_ENV);
  const usesSuperTokens = [
    'coexistence',
    'supertokens_primary',
    'supertokens_only',
  ].includes(value.AUTH_PROVIDER_MODE);
  if (usesSuperTokens) {
    for (const name of [
      'SUPERTOKENS_CONNECTION_URI',
      'SUPERTOKENS_APP_NAME',
      'SUPERTOKENS_API_DOMAIN',
    ]) {
      if (!String(value[name] || '').trim())
        throw new Error(`Missing ${name} for auth coexistence.`);
    }
    if (
      appEnv === 'production' &&
      !String(value.SUPERTOKENS_API_KEY || '').trim()
    )
      throw new Error(
        'SUPERTOKENS_API_KEY is required for production coexistence.',
      );
    if (
      value.AUTH_PROVIDER_MODE === 'supertokens_only' &&
      value.AUTH_MIGRATION_ENABLED !== 'true'
    ) {
      throw new Error(
        'AUTH_MIGRATION_ENABLED must be true for supertokens_only.',
      );
    }
  }
  if (
    ['coexistence', 'local_primary', 'local_only'].includes(
      value.AUTH_PROVIDER_MODE,
    )
  )
    assertLocalJwtConfigured(value as NodeJS.ProcessEnv);
  if (['local_primary', 'local_only'].includes(value.AUTH_PROVIDER_MODE))
    throw new Error(
      'Local auth modes require a configured password recovery adapter.',
    );
  if (value.LOCAL_PASSWORD_RECOVERY_ENABLED === 'true') {
    throw new Error(
      'LOCAL_PASSWORD_RECOVERY_ENABLED requires a configured password email adapter.',
    );
  }
  const storageProvider = String(
    value.STORAGE_WRITE_PROVIDER || 'supabase',
  ).toLowerCase();
  if (!['supabase', 'gcs'].includes(storageProvider))
    throw new Error('STORAGE_WRITE_PROVIDER is invalid.');
  if (storageProvider === 'gcs' || value.GCS_STORAGE_ENABLED === 'true') {
    if (
      !String(value.GCS_PROJECT_ID || '').trim() ||
      !String(value.GCS_STORAGE_BUCKET || '').trim()
    )
      throw new Error('GCS storage configuration is incomplete.');
  }
  const deployedRuntime =
    value.NODE_ENV === 'production' ||
    appEnv === 'production' ||
    appEnv === 'staging';
  if (deployedRuntime) {
    const required = [
      'CORS_ALLOWED_ORIGINS',
      'PUBLIC_APP_URL',
      'AUDIT_HASH_SECRET',
      'CERT_ENCRYPTION_KEY',
      'CERT_ENCRYPTION_KEY_VERSION',
      'BILLING_CHECKOUT_ENABLED',
      'BILLING_WEBHOOK_ENABLED',
      'BILLING_ENFORCEMENT_ENABLED',
      'SUPABASE_PROJECT_REF',
      'PRODUCTION_SUPABASE_PROJECT_REF',
    ].filter((name) => !String(value[name] ?? '').trim());
    if (String(value.STOREFRONT_ORDERING_ENABLED).toLowerCase() === 'true') {
      requireWhenEmpty(required, value, 'STOREFRONT_TOKEN_SECRET');
    }
    if (appEnv === 'staging') {
      requireWhenEmpty(required, value, 'STAGING_SUPABASE_PROJECT_REF');
    }
    const checkoutEnabled =
      String(value.BILLING_CHECKOUT_ENABLED ?? '').toLowerCase() === 'true';
    const webhookEnabled =
      String(value.BILLING_WEBHOOK_ENABLED ?? '').toLowerCase() === 'true';
    if (checkoutEnabled || webhookEnabled) {
      requireWhenEmpty(required, value, 'BILLING_EXTERNAL_REFERENCE_SECRET');
      requireWhenEmpty(required, value, 'MERCADO_PAGO_ACCESS_TOKEN');
      requireWhenEmpty(required, value, 'MERCADO_PAGO_MODE');
    }
    if (checkoutEnabled) {
      requireWhenEmpty(required, value, 'MERCADO_PAGO_PLAN_ID_OURO');
      requireWhenEmpty(required, value, 'MERCADO_PAGO_PLAN_ID_ESMERALDA');
      requireWhenEmpty(required, value, 'MERCADO_PAGO_PLAN_ID_DIAMANTE');
    }
    if (webhookEnabled) {
      requireWhenEmpty(required, value, 'MERCADO_PAGO_ACCESS_TOKEN');
      requireWhenEmpty(required, value, 'MERCADO_PAGO_WEBHOOK_SECRET');
      requireWhenEmpty(required, value, 'MERCADO_PAGO_COLLECTOR_ID');
      requireWhenEmpty(required, value, 'MERCADO_PAGO_MODE');
    }
    if (required.length) {
      throw new Error(
        `Missing required production environment variables: ${required.join(', ')}`,
      );
    }
    const origins = String(value.CORS_ALLOWED_ORIGINS)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (
      !origins.length ||
      origins.some((origin) => !origin.startsWith('https://'))
    ) {
      throw new Error(
        'CORS_ALLOWED_ORIGINS must contain only HTTPS origins in production.',
      );
    }
    validateCertificateKey(String(value.CERT_ENCRYPTION_KEY || ''));
  }
  validateEnvironmentIsolation(value, appEnv);
  Object.assign(process.env, value);
  return value;
}

function requireWhenEmpty(
  required: string[],
  value: Record<string, unknown>,
  name: string,
) {
  if (!String(value[name] ?? '').trim() && !required.includes(name)) {
    required.push(name);
  }
}

function validateCertificateKey(value: string) {
  const decoded = Buffer.from(value, 'base64');
  if (
    decoded.length !== 32 ||
    decoded.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, '')
  ) {
    throw new Error(
      'CERT_ENCRYPTION_KEY must be valid base64 containing exactly 32 bytes.',
    );
  }
}

function validateEnvironmentIsolation(
  value: Record<string, unknown>,
  appEnv: string,
) {
  const projectRef = String(value.SUPABASE_PROJECT_REF || '').trim();
  const productionRef = String(
    value.PRODUCTION_SUPABASE_PROJECT_REF || '',
  ).trim();
  const stagingRef = String(value.STAGING_SUPABASE_PROJECT_REF || '').trim();
  const supabaseUrl = String(value.SUPABASE_URL || '');
  const publicAppUrl = String(value.PUBLIC_APP_URL || '');
  const productionHost = String(value.PRODUCTION_APP_HOST || '')
    .trim()
    .toLowerCase();
  const mercadoPagoMode = String(value.MERCADO_PAGO_MODE || '').toLowerCase();
  const auditHashSecret = String(value.AUDIT_HASH_SECRET || '');
  const sessionHashSecret = String(
    value.SESSION_HASH_SECRET || value.AUDIT_HASH_SECRET || '',
  );

  if (
    ['staging', 'production'].includes(appEnv) &&
    auditHashSecret.length < 32
  ) {
    throw new Error(
      'AUDIT_HASH_SECRET must contain at least 32 characters in staging/production.',
    );
  }
  if (
    ['staging', 'production'].includes(appEnv) &&
    sessionHashSecret.length < 32
  ) {
    throw new Error(
      'SESSION_HASH_SECRET or AUDIT_HASH_SECRET must contain at least 32 characters.',
    );
  }

  if (
    projectRef &&
    !supabaseUrl.toLowerCase().includes(projectRef.toLowerCase())
  ) {
    throw new Error('SUPABASE_PROJECT_REF does not match SUPABASE_URL.');
  }
  assertSupabaseDatabaseProject(
    String(value.DATABASE_URL || ''),
    projectRef,
    'DATABASE_URL',
  );
  assertSupabaseDatabaseProject(
    String(value.ADMIN_DATABASE_URL || value.DIRECT_URL || ''),
    projectRef,
    value.ADMIN_DATABASE_URL ? 'ADMIN_DATABASE_URL' : 'DIRECT_URL',
  );
  if (appEnv === 'staging') {
    if (!projectRef || !stagingRef || projectRef !== stagingRef) {
      throw new Error(
        'Staging requires matching SUPABASE_PROJECT_REF and STAGING_SUPABASE_PROJECT_REF.',
      );
    }
    if (productionRef && projectRef === productionRef) {
      throw new Error('Staging cannot use the production Supabase project.');
    }
    if (
      productionHost &&
      new URL(publicAppUrl).hostname.toLowerCase() === productionHost
    ) {
      throw new Error('Staging cannot use the production application host.');
    }
    if (mercadoPagoMode === 'production') {
      throw new Error('Staging cannot use Mercado Pago production mode.');
    }
  }
  if (appEnv === 'production') {
    if (projectRef !== productionRef) {
      throw new Error(
        'Production SUPABASE_PROJECT_REF does not match the approved production project.',
      );
    }
    const webhookEnabled =
      String(value.BILLING_WEBHOOK_ENABLED || '').toLowerCase() === 'true';
    if (webhookEnabled && mercadoPagoMode !== 'production') {
      throw new Error('Production cannot use Mercado Pago sandbox/test mode.');
    }
  }
}

function assertSupabaseDatabaseProject(
  rawUrl: string,
  projectRef: string,
  variableName: string,
) {
  if (!rawUrl || !projectRef) return;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`${variableName} is not a valid URL.`);
  }

  const host = parsed.hostname.toLowerCase();
  const isSupabaseDatabase =
    host.includes('pooler.supabase.com') || host.endsWith('.supabase.co');
  if (!isSupabaseDatabase) return;

  const identity =
    `${host}/${decodeURIComponent(parsed.username)}`.toLowerCase();
  if (!identity.includes(projectRef.toLowerCase())) {
    throw new Error(`${variableName} does not match SUPABASE_PROJECT_REF.`);
  }
}
