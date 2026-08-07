import { randomUUID } from 'node:crypto';

export function storageObjectKey(input: { tenantId: string; branchId?: string | null; category: string; extension?: string }): string {
  for (const value of [input.tenantId, input.branchId || '', input.category]) {
    if (!value || value.includes('..') || value.includes('/') || value.includes('\\') || /[\u0000-\u001f]/.test(value)) throw new Error('STORAGE_KEY_SCOPE_INVALID');
  }
  const extension = input.extension?.replace(/^\./, '').toLowerCase();
  if (extension && !/^[a-z0-9]{1,12}$/.test(extension)) throw new Error('STORAGE_KEY_EXTENSION_INVALID');
  return ['tenants', input.tenantId, ...(input.branchId ? ['branches', input.branchId] : []), input.category, randomUUID() + (extension ? `.${extension}` : '')].join('/');
}
