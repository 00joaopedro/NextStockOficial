export type CookieOptions = Record<string, unknown>;

export type HeaderCapableReply = {
  setHeader?: (name: string, value: string) => unknown;
  header?: (name: string, value: string) => unknown;
};

export type CookieCapableReply = HeaderCapableReply & {
  cookie?: (name: string, value: string, options?: CookieOptions) => unknown;
  setCookie?: (name: string, value: string, options?: CookieOptions) => unknown;
  clearCookie?: (name: string, options?: CookieOptions) => unknown;
};

export function setReplyHeader(
  reply: HeaderCapableReply | undefined,
  name: string,
  value: string,
) {
  if (!reply) return;
  if (typeof reply.header === 'function') {
    reply.header(name, value);
    return;
  }
  reply.setHeader?.(name, value);
}

export function setReplyCookie(
  reply: CookieCapableReply,
  name: string,
  value: string,
  options: CookieOptions,
) {
  if (typeof reply.setCookie === 'function') {
    reply.setCookie(name, value, options);
    return;
  }
  reply.cookie?.(name, value, options);
}

export function clearReplyCookie(
  reply: CookieCapableReply,
  name: string,
  options: CookieOptions,
) {
  if (typeof reply.clearCookie === 'function') {
    reply.clearCookie(name, options);
    return;
  }
  setReplyCookie(reply, name, '', {
    ...options,
    expires: new Date(0),
    maxAge: 0,
  });
}
