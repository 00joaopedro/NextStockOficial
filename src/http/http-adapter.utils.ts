export function getHeader(req: any, name: string): string | undefined {
  const headerValue =
    typeof req?.header === 'function'
      ? req.header(name)
      : req?.headers?.[name.toLowerCase()];

  if (Array.isArray(headerValue)) return headerValue[0];
  return typeof headerValue === 'string' ? headerValue : undefined;
}

export function setHeader(
  res: any,
  name: string,
  value: string | number | readonly string[],
) {
  if (typeof res?.setHeader === 'function') {
    res.setHeader(name, value);
    return;
  }
  if (typeof res?.header === 'function') {
    res.header(name, value);
    return;
  }
  if (typeof res?.set === 'function') {
    res.set(name, value);
  }
}

export function getClientIp(req: any): string | undefined {
  const forwardedFor = getHeader(req, 'x-forwarded-for')?.split(',')[0]?.trim();

  return forwardedFor || req?.ip;
}

export function getUserAgent(req: any): string | undefined {
  return getHeader(req, 'user-agent');
}
