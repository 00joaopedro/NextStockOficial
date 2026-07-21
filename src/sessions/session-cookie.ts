import type { CompatibleReply } from '../common/http-types';

export const SESSION_COOKIE_NAME = 'nextstock_session';

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

export function clearAuthCookies(reply: CompatibleReply) {
  reply.clearCookie('jwt', sessionCookieOptions());
  reply.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions());
}
