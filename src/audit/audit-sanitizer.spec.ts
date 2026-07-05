import { auditFingerprint, sanitizeAuditValue } from './audit-sanitizer';

describe('audit sanitizer', () => {
  it('removes secrets and bounds nested values', () => {
    expect(
      sanitizeAuditValue({
        action: 'login',
        password: 'never-store',
        jwtToken: 'never-store',
        cookie: 'never-store',
        nested: { signedUrl: 'never-store', allowed: 'ok' },
      }),
    ).toEqual({
      action: 'login',
      nested: { allowed: 'ok' },
    });
  });

  it('uses HMAC for network fingerprints', () => {
    process.env.AUDIT_HASH_SECRET = 'a'.repeat(32);
    const first = auditFingerprint('127.0.0.1');
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toBe(auditFingerprint('127.0.0.1'));
    expect(first).not.toBe(auditFingerprint('127.0.0.2'));
  });
});
