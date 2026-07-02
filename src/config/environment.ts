import * as Joi from 'joi';

const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  DATABASE_URL: Joi.string().required(),
  DIRECT_URL: Joi.string().allow('').optional(),
  SUPABASE_URL: Joi.string().uri({ scheme: ['https', 'http'] }).required(),
  SUPABASE_ANON_KEY: Joi.string().min(20).required(),
  SUPABASE_SERVICE_ROLE_KEY: Joi.string().min(20).required(),
  SUPABASE_JWT_SECRET: Joi.string().min(20).allow('').optional(),
  CORS_ALLOWED_ORIGINS: Joi.string().allow('').optional(),
  PUBLIC_APP_URL: Joi.string().uri({ scheme: ['https', 'http'] }).allow('').optional(),
  BILLING_EXTERNAL_REFERENCE_SECRET: Joi.string().min(32).allow('').optional(),
  MERCADO_PAGO_WEBHOOK_SECRET: Joi.string().min(16).allow('').optional(),
  MERCADO_PAGO_ACCESS_TOKEN: Joi.string().allow('').optional(),
  MERCADO_PAGO_COLLECTOR_ID: Joi.string().allow('').optional(),
  CERT_ENCRYPTION_KEY: Joi.string().base64().allow('').optional(),
  CERT_ENCRYPTION_KEY_VERSION: Joi.string().max(32).allow('').optional(),
  CSP_ENFORCE: Joi.string().valid('true', 'false').optional(),
}).unknown(true);

export function validateEnvironment(env: NodeJS.ProcessEnv) {
  const { error, value } = schema.validate(env, {
    abortEarly: false,
    allowUnknown: true,
    stripUnknown: false,
  });
  if (error) {
    throw new Error(`Invalid environment configuration: ${error.details.map((d) => d.path.join('.')).join(', ')}`);
  }
  if (value.NODE_ENV === 'production') {
    const required = [
      'CORS_ALLOWED_ORIGINS',
      'PUBLIC_APP_URL',
      'BILLING_EXTERNAL_REFERENCE_SECRET',
    ].filter((name) => !String(value[name] ?? '').trim());
    if (required.length) {
      throw new Error(`Missing required production environment variables: ${required.join(', ')}`);
    }
    const origins = String(value.CORS_ALLOWED_ORIGINS)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (!origins.length || origins.some((origin) => !origin.startsWith('https://'))) {
      throw new Error('CORS_ALLOWED_ORIGINS must contain only HTTPS origins in production.');
    }
  }
  Object.assign(process.env, value);
  return value;
}
