import * as Joi from 'joi';

const schema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  APP_ENV: Joi.string()
    .valid('development', 'test', 'staging', 'production')
    .optional(),
  DATABASE_URL: Joi.string().required(),
  DIRECT_URL: Joi.string().allow('').optional(),
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
  MERCADO_PAGO_PLAN_ID_OURO: Joi.string().allow('').optional(),
  MERCADO_PAGO_PLAN_ID_ESMERALDA: Joi.string().allow('').optional(),
  MERCADO_PAGO_PLAN_ID_DIAMANTE: Joi.string().allow('').optional(),
  CERT_ENCRYPTION_KEY: Joi.string().base64().allow('').optional(),
  CERT_ENCRYPTION_KEY_VERSION: Joi.string().max(32).allow('').optional(),
  CSP_ENFORCE: Joi.string().valid('true', 'false').optional(),
  MERCADO_PAGO_MODE: Joi.string()
    .valid('sandbox', 'test', 'production')
    .optional(),
  AUDIT_HASH_SECRET: Joi.string().min(32).allow('').optional(),
  SESSION_HASH_SECRET: Joi.string().min(32).allow('').optional(),
  SESSION_ENFORCEMENT_ENABLED: Joi.string().valid('true', 'false').optional(),
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
    !String(value.SUPABASE_ANON_KEY || '').trim() &&
    !String(value.SUPABASE_PUBLISHABLE_KEY || '').trim()
  ) {
    throw new Error(
      'Missing required environment variable: SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY',
    );
  }
  const appEnv = String(value.APP_ENV || value.NODE_ENV);
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
