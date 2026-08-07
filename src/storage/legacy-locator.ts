import { StorageLocator } from './storage-provider';

export type LegacyLocatorResult = { status: 'MIGRATABLE' | 'RECONCILIATION_REQUIRED' | 'NOT_RECOGNIZED'; locator?: StorageLocator; reason?: string };

export function parseSupabaseLocator(value: string, allowedOrigins: string[], expectedTenantId?: string): LegacyLocatorResult {
  let url: URL;
  try { url = new URL(value); } catch { return { status: 'NOT_RECOGNIZED', reason: 'invalid_url' }; }
  if (!allowedOrigins.includes(url.origin) || url.search) return { status: 'RECONCILIATION_REQUIRED', reason: 'origin_or_query_not_allowed' };
  const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
  if (!match || match[2].includes('..') || match[2].includes('\\')) return { status: 'RECONCILIATION_REQUIRED', reason: 'path_not_deterministic' };
  if (expectedTenantId && !match[2].startsWith(`${expectedTenantId}/`)) return { status: 'RECONCILIATION_REQUIRED', reason: 'tenant_scope_mismatch' };
  return { status: 'MIGRATABLE', locator: { provider: 'SUPABASE', bucket: decodeURIComponent(match[1]), objectKey: decodeURIComponent(match[2]) } };
}
