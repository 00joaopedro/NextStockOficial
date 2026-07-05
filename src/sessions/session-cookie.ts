import type { Response } from 'express';

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
  response: Response,
  token: string,
  expiresAt: Date,
) {
  response.cookie(SESSION_COOKIE_NAME, token, {
    ...sessionCookieOptions(),
    expires: expiresAt,
  });
}

export function clearAuthCookies(response: Response) {
  response.clearCookie('jwt', sessionCookieOptions());
  response.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions());
}
