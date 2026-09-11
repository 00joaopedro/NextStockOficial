export const PASSWORD_RESET_ROUTE = '/reset-password.html';

export function getPasswordRecoveryRedirectUrl(
  env: NodeJS.ProcessEnv = process.env,
) {
  const raw = env.PUBLIC_APP_URL?.trim();
  if (!raw)
    throw new Error('PUBLIC_APP_URL is required for password recovery.');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('PUBLIC_APP_URL must be an absolute URL.');
  }
  const appEnv = env.APP_ENV || env.NODE_ENV || 'development';
  const deployed =
    env.NODE_ENV === 'production' || ['staging', 'production'].includes(appEnv);
  if (deployed) {
    if (url.protocol !== 'https:')
      throw new Error(
        'PUBLIC_APP_URL must use HTTPS in deployed environments.',
      );
    if (['localhost', '127.0.0.1', '::1'].includes(url.hostname))
      throw new Error(
        'PUBLIC_APP_URL cannot use localhost in deployed environments.',
      );
  }
  return new URL(PASSWORD_RESET_ROUTE, url).toString();
}
