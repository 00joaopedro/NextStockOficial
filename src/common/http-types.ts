export type Request = {
  body?: Record<string, unknown>;
  cookies?: Record<string, string | undefined>;
  header(name: string): string | undefined;
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  method: string;
  originalUrl?: string;
  path?: string;
  requestId?: string;
  route?: { path?: string };
  socket: { remoteAddress?: string };
  url?: string;
  user?: AuthenticatedUser;
};

export type AuthenticatedHttpRequest = Request;

export type CookieOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none' | boolean;
  path?: string;
  maxAge?: number;
  expires?: Date;
};

export type CompatibleReply = {
  setCookie(name: string, value: string, options?: CookieOptions): unknown;
  clearCookie(name: string, options?: CookieOptions): unknown;
  header(name: string, value: string): unknown;
};

export type Response = {
  status(statusCode: number): Response;
  json(payload: unknown): unknown;
};
