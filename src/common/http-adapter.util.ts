export type HeaderContainer = {
  header?: (name: string) => string | string[] | undefined;
  get?: (name: string) => string | string[] | undefined;
  headers?: Record<string, string | string[] | undefined>;
};

export function getHeader(
  request: HeaderContainer | undefined,
  name: string,
): string | undefined {
  const normalizedName = name.toLowerCase();
  const valueFromAccessor =
    typeof request?.header === 'function'
      ? request.header(name)
      : typeof request?.get === 'function'
        ? request.get(name)
        : undefined;
  const value =
    valueFromAccessor ??
    request?.headers?.[normalizedName] ??
    request?.headers?.[name];

  return normalizeHeaderValue(value);
}

export function getClientIp(request: any): string | null {
  const forwardedFor = getHeader(request, 'x-forwarded-for')
    ?.split(',')[0]
    ?.trim();
  return (
    forwardedFor ||
    getHeader(request, 'x-real-ip') ||
    request?.ip ||
    request?.ips?.[0] ||
    request?.socket?.remoteAddress ||
    request?.raw?.socket?.remoteAddress ||
    null
  );
}

export function getUserAgent(request: any): string | null {
  return getHeader(request, 'user-agent') ?? null;
}

export function getResponseStatusCode(
  response: any,
  request?: any,
): number | undefined {
  const statusCode =
    response?.statusCode ??
    response?.raw?.statusCode ??
    request?.res?.statusCode ??
    request?.raw?.res?.statusCode;

  return typeof statusCode === 'number' ? statusCode : undefined;
}

function normalizeHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
