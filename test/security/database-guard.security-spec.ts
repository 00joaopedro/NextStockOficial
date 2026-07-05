import { assertSafeTestDatabaseUrl } from '../helpers/test-database.guard';

describe('security test database guard', () => {
  it('accepts a local database explicitly named as test', () => {
    expect(
      assertSafeTestDatabaseUrl(
        'postgresql://postgres:postgres@127.0.0.1:5432/nextstock_security_test',
      ),
    ).toContain('nextstock_security_test');
  });

  it('rejects an ambiguous remote database', () => {
    expect(() =>
      assertSafeTestDatabaseUrl(
        'postgresql://user:pass@db.example.com:5432/nextstock',
      ),
    ).toThrow('Unsafe security test database URL');
  });
});
