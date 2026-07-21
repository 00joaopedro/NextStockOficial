export type Request = {
  body?: Record<string, unknown>;
  cookies?: Record<string, string | undefined>;
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  method: string;
  originalUrl?: string;
  path?: string;
  requestId?: string;
  route?: { path?: string };
  socket?: { remoteAddress?: string };
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
  send(payload: unknown): unknown;
};

export function getRequestHeader(
  request: Pick<Request, 'headers'> | undefined,
  name: string,
): string | undefined {
  const headers = request?.headers;
  if (!headers) return undefined;

  const normalizedName = name.toLowerCase();
  const value =
    headers[normalizedName] ??
    Object.entries(headers).find(
      ([key]) => key.toLowerCase() === normalizedName,
    )?.[1];

  return Array.isArray(value) ? value[0] : value;
}
