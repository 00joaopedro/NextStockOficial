import { createHmac } from 'crypto';

const FORBIDDEN_KEY =
  /password|senha|token|authorization|cookie|secret|service.?role|private.?key|certificate|pfx|signed.?url|xml|pdf|payload/i;
const MAX_DEPTH = 4;
const MAX_KEYS = 40;
const MAX_STRING = 500;

export function sanitizeAuditValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (depth >= MAX_DEPTH) return '[TRUNCATED]';
  if (typeof value === 'string') return value.slice(0, MAX_STRING);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value
      .slice(0, 20)
      .map((item) => sanitizeAuditValue(item, depth + 1));
  }
  if (typeof value !== 'object') return String(value).slice(0, MAX_STRING);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, MAX_KEYS)
      .filter(([key]) => !FORBIDDEN_KEY.test(key))
      .map(([key, item]) => [key, sanitizeAuditValue(item, depth + 1)]),
  );
}

export function auditFingerprint(value?: string | null) {
  if (!value) return null;
  const secret = process.env.AUDIT_HASH_SECRET;
  if (!secret) return null;
  return createHmac('sha256', secret).update(value).digest('hex');
}
