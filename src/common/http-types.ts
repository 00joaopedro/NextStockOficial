export type AuthenticatedHttpRequest = {
  cookies?: Record<string, string | undefined>;
  user?: Express.AuthenticatedUser;
};

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
