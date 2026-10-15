import type { CompatibleReply } from '../common/http-types';

export const SESSION_COOKIE_NAME = 'nextstock_session';
export const AUTH_REFRESH_COOKIE_NAME = 'nextstock_refresh_token';

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  };
}

export function setSessionCookie(
  reply: CompatibleReply,
  token: string,
  expiresAt: Date,
) {
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    ...sessionCookieOptions(),
    expires: expiresAt,
  });
}

export function setAuthRefreshCookie(reply: CompatibleReply, token: string) {
  reply.setCookie(AUTH_REFRESH_COOKIE_NAME, token, sessionCookieOptions());
}

export function clearAuthCookies(reply: CompatibleReply) {
  const options = sessionCookieOptions();
  reply.clearCookie('jwt', options);
  reply.clearCookie(SESSION_COOKIE_NAME, options);
  reply.clearCookie(AUTH_REFRESH_COOKIE_NAME, options);
}
