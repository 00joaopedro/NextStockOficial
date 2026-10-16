const DEFAULT_SESSION_REFRESH_TIMEOUT_MS = 5_000;

export function sessionRefreshTimeoutMs() {
  const configured = Number(
    process.env.SESSION_REFRESH_TIMEOUT_MS || DEFAULT_SESSION_REFRESH_TIMEOUT_MS,
  );
  return Number.isInteger(configured) &&
    configured >= 3_000 &&
    configured <= 10_000
    ? configured
    : DEFAULT_SESSION_REFRESH_TIMEOUT_MS;
}
