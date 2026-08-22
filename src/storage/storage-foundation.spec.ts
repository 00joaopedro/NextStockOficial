import { FakeStorageProvider } from './fake-storage-provider';
import { parseSupabaseLocator } from './legacy-locator';
import { StorageProviderRegistry } from './storage-registry';
import { storageObjectKey } from './storage-key';

describe('storage provider foundation', () => {
  it('keeps Supabase as default and blocks disabled GCS', () => {
    const supabase = new FakeStorageProvider('SUPABASE');
    const gcs = new FakeStorageProvider('GCS');
    const registry = new StorageProviderRegistry(supabase, gcs);
    expect(registry.writeProvider({})).toBe('SUPABASE');
    expect(registry.provider('SUPABASE')).toBe(supabase);
    expect(registry.provider('GCS')).toBe(gcs);
    expect(() =>
      registry.writeProvider({ STORAGE_WRITE_PROVIDER: 'GCS' }),
    ).toThrow('DISABLED');
  });
  it('generates scoped keys and rejects traversal', () => {
    expect(
      storageObjectKey({
        tenantId: 'tenant',
        branchId: 'branch',
        category: 'pets',
        extension: 'webp',
      }),
    ).toMatch(/^tenants\/tenant\/branches\/branch\/pets\/[0-9a-f-]+\.webp$/);
    expect(() =>
      storageObjectKey({ tenantId: '../tenant', category: 'pets' }),
    ).toThrow('SCOPE');
  });
  it('parses only recognized deterministic Supabase locators', () => {
    expect(
      parseSupabaseLocator(
        'https://storage.test/storage/v1/object/public/pets/tenant/photo.webp',
        ['https://storage.test'],
        'tenant',
      ).status,
    ).toBe('MIGRATABLE');
    expect(
      parseSupabaseLocator(
        'https://evil.test/storage/v1/object/public/pets/tenant/photo.webp',
        ['https://storage.test'],
      ).status,
    ).toBe('RECONCILIATION_REQUIRED');
  });
  it('supports fake streams, generation and create-only semantics', async () => {
    const provider = new FakeStorageProvider();
    const locator = { bucket: 'bucket', objectKey: 'tenant/object' };
    await expect(
      provider.putObject(locator, Buffer.from('data'), {
        contentType: 'text/plain',
        sha256: 'hash',
      }),
    ).resolves.toMatchObject({
      provider: 'GCS',
      generation: '1',
      sizeBytes: 4,
    });
    await expect(
      provider.putObject(locator, Buffer.from('other'), {}),
    ).rejects.toThrow('EXISTS');
    await expect(provider.objectExists(locator)).resolves.toBe(true);
  });
});
