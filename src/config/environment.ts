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
  SUPABASE_ANON_KEY: Joi.string().min(20).required(),
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
  MERCADO_PAGO_WEBHOOK_SECRET: Joi.string().min(16).allow('').optional(),
  MERCADO_PAGO_ACCESS_TOKEN: Joi.string().allow('').optional(),
  MERCADO_PAGO_COLLECTOR_ID: Joi.string().allow('').optional(),
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
  const appEnv = String(value.APP_ENV || value.NODE_ENV);
  if (value.NODE_ENV === 'production') {
    const required = [
      'CORS_ALLOWED_ORIGINS',
      'PUBLIC_APP_URL',
      'BILLING_EXTERNAL_REFERENCE_SECRET',
    ].filter((name) => !String(value[name] ?? '').trim());
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
  }
  validateEnvironmentIsolation(value, appEnv);
  Object.assign(process.env, value);
  return value;
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
    if (productionRef && projectRef !== productionRef) {
      throw new Error(
        'Production SUPABASE_PROJECT_REF does not match the approved production project.',
      );
    }
    if (mercadoPagoMode && mercadoPagoMode !== 'production') {
      throw new Error('Production cannot use Mercado Pago sandbox/test mode.');
    }
  }
}
