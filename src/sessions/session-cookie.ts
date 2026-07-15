import type { Response } from 'express';
import { clearReplyCookie, setReplyCookie } from '../common/http-reply.util';

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
  setReplyCookie(response, SESSION_COOKIE_NAME, token, {
    ...sessionCookieOptions(),
    expires: expiresAt,
  });
}

export function clearAuthCookies(response: Response) {
  clearReplyCookie(response, 'jwt', sessionCookieOptions());
  clearReplyCookie(response, SESSION_COOKIE_NAME, sessionCookieOptions());
}
