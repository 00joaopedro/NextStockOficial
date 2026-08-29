export type LocalJwtKey = { secret: string; kid: string };

export function localJwtConfig(env: NodeJS.ProcessEnv = process.env) {
  const active: LocalJwtKey = {
    secret: env.LOCAL_AUTH_JWT_ACTIVE_KEY?.trim() ?? '',
    kid: env.LOCAL_AUTH_JWT_KID?.trim() ?? '',
  };
  const previousSecret = env.LOCAL_AUTH_JWT_PREVIOUS_KEY?.trim() ?? '';
  const previousKid = env.LOCAL_AUTH_JWT_PREVIOUS_KID?.trim() ?? '';
  const hasPrevious = Boolean(previousSecret || previousKid);
  if (hasPrevious && (!previousSecret || !previousKid)) {
    throw new Error('LOCAL_AUTH_JWT_PREVIOUS_KEY and KID must be configured together.');
  }
  if (!active.secret || active.secret.length < 32 || !active.kid) {
    throw new Error('Local JWT signing configuration is incomplete.');
  }
  if (hasPrevious && previousSecret.length < 32) {
    throw new Error('Local JWT previous key is invalid.');
  }
  const issuer = env.LOCAL_AUTH_JWT_ISSUER?.trim() || 'nextstock-local-auth';
  const audience = env.LOCAL_AUTH_JWT_AUDIENCE?.trim() || 'nextstock-api';
  if (!issuer || !audience || issuer.length > 200 || audience.length > 200) {
    throw new Error('Local JWT issuer or audience is invalid.');
  }
  return {
    active,
    previous: hasPrevious ? { secret: previousSecret, kid: previousKid } : null,
    issuer,
    audience,
    ttlSeconds: Number(env.LOCAL_AUTH_JWT_TTL_SECONDS || 300),
  };
}

export function assertLocalJwtConfigured(env: NodeJS.ProcessEnv = process.env) {
  localJwtConfig(env);
}

export function localJwtKeyForKid(kid: unknown, env: NodeJS.ProcessEnv = process.env) {
  if (typeof kid !== 'string' || !kid) throw new Error('LOCAL_JWT_INVALID');
  const config = localJwtConfig(env);
  if (kid === config.active.kid) return config.active;
  if (config.previous?.kid === kid) return config.previous;
  throw new Error('LOCAL_JWT_INVALID');
}
