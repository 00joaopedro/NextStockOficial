import { migrationInventory } from '../scripts/platform/validate-postgresql-portability';
import {
  describeDatabaseUrl,
  selectAdministrativeDatabaseUrl,
} from '../scripts/lib/admin-database-url';

describe('Phase 2 PostgreSQL portability guardrails', () => {
  it('deterministically inventories critical migration features', () => {
    const inventory = migrationInventory();
    expect(inventory.migrations).toBeGreaterThan(50);
    expect(inventory.requiredExtensions).toContain('pgcrypto');
    expect(inventory.triggers).toBeGreaterThan(0);
    expect(inventory.policies).toBeGreaterThan(0);
    expect(inventory.rlsTables).toBeGreaterThan(0);
    expect(inventory.indexes).toBeGreaterThan(0);
    expect(inventory.enums).toBeGreaterThan(0);
  });

  it.each([
    'postgresql://admin:secret@cloud.internal:6543/app',
    'postgresql://admin:secret@cloud.internal:5432/app?pgbouncer=true',
  ])(
    'rejects generic transaction pooler admin URL without leaking credentials',
    (url) => {
      expect(() =>
        selectAdministrativeDatabaseUrl({ DIRECT_URL: url }),
      ).toThrow('transaction pooler');
      expect(describeDatabaseUrl(url)).toBe(
        `host=cloud.internal port=${url.includes(':6543') ? '6543' : '5432'} database=app`,
      );
      expect(describeDatabaseUrl(url)).not.toContain('secret');
    },
  );
});
