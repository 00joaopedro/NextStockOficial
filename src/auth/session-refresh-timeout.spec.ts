import { sessionRefreshTimeoutMs } from './session-refresh-timeout';

describe('sessionRefreshTimeoutMs', () => {
  const original = process.env.SESSION_REFRESH_TIMEOUT_MS;

  afterEach(() => {
    if (original === undefined) delete process.env.SESSION_REFRESH_TIMEOUT_MS;
    else process.env.SESSION_REFRESH_TIMEOUT_MS = original;
  });

  it('defaults above the previous 1.8 second production limit', () => {
    delete process.env.SESSION_REFRESH_TIMEOUT_MS;
    expect(sessionRefreshTimeoutMs()).toBe(5_000);
  });

  it('accepts a safe production override', () => {
    process.env.SESSION_REFRESH_TIMEOUT_MS = '7000';
    expect(sessionRefreshTimeoutMs()).toBe(7_000);
  });

  it('rejects unsafe overrides', () => {
    process.env.SESSION_REFRESH_TIMEOUT_MS = '1000';
    expect(sessionRefreshTimeoutMs()).toBe(5_000);
  });
});
