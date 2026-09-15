export const PASSWORD_RESET_ROUTE = '/reset-password.html';

export function normalizeHostname(hostname: string) {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/, '$1')
    .replace(/\.+$/, '');
}

export function isLoopbackHostname(hostname: string) {
  return ['localhost', '127.0.0.1', '::1'].includes(
    normalizeHostname(hostname),
  );
}

export function getPasswordRecoveryRedirectUrl(
  env: NodeJS.ProcessEnv = process.env,
) {
  const raw = (env.SUPABASE_PASSWORD_REDIRECT_URL || env.PUBLIC_APP_URL)?.trim();
  if (!raw)
    throw new Error('SUPABASE_PASSWORD_REDIRECT_URL or PUBLIC_APP_URL is required for password recovery.');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Password recovery redirect must be an absolute URL.');
  }
  const appEnv = env.APP_ENV || env.NODE_ENV || 'development';
  const deployed =
    env.NODE_ENV === 'production' || ['staging', 'production'].includes(appEnv);
  if (deployed) {
    if (url.protocol !== 'https:')
      throw new Error(
        'PUBLIC_APP_URL must use HTTPS in deployed environments.',
      );
    if (isLoopbackHostname(url.hostname))
      throw new Error(
        'PUBLIC_APP_URL cannot use localhost in deployed environments.',
      );
  }
  if (url.username || url.password || url.hash)
    throw new Error('Password recovery redirect must not contain credentials or a fragment.');
  if (url.pathname !== PASSWORD_RESET_ROUTE)
    throw new Error('Password recovery redirect must use the reset-password route.');
  return url.toString();
}
