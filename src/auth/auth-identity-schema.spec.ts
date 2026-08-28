import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('authentication identity foundation schema', () => {
  const schema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
  const migration = readFileSync(
    join(
      process.cwd(),
      'prisma',
      'migrations',
      '20260828000000_auth_identity_invariants',
      'migration.sql',
    ),
    'utf8',
  );

  it('keeps UserProfile canonical and LocalCredential separate from external identities', () => {
    expect(schema).toContain('model UserProfile {');
    expect(schema).not.toMatch(/model User\s*\{/);
    expect(schema).toContain('localCredential          LocalCredential?');
    expect(schema).toContain('authIdentities           AuthIdentity[]');
    expect(schema).toContain('profileId         String      @unique');
  });

  it('models only Google and legacy Supabase identities by immutable subject', () => {
    expect(schema).toContain('enum AuthIdentityProvider');
    expect(schema).toContain('GOOGLE   @map("google")');
    expect(schema).toContain('SUPABASE @map("supabase")');
    expect(schema).toContain('userProfileId          String');
    expect(schema).toContain('providerSubject        String');
    expect(schema).toContain('canonicalEmail         String?');
    expect(schema).toContain('emailVerifiedAt        DateTime?');
    expect(schema).toContain('lastUsedAt             DateTime?');
    expect(schema).toContain('disabledAt             DateTime?');
    expect(schema).toContain('@@unique([provider, providerSubject])');
    expect(schema).toContain('@@unique([userProfileId, provider])');
    expect(schema).toContain('userProfile            UserProfile');
  });

  it('enforces non-empty subjects and normalized optional email in the database', () => {
    expect(migration).toContain('auth_identities_provider_subject_nonempty_check');
    expect(migration).toContain('length(btrim("provider_user_id")) > 0');
    expect(migration).toContain('auth_identities_canonical_email_normalized_check');
    expect(migration).toContain('"canonical_email" IS NULL OR');
    expect(schema).toContain('@@unique([provider, providerSubject])');
    expect(schema).toContain('@@unique([userProfileId, provider])');
    expect(migration).not.toContain('INSERT INTO "auth_identities"');
    expect(migration).not.toContain('DROP TABLE');
  });

  it('retains the existing table and profile identifiers without takeover on disable', () => {
    expect(migration).toContain('CREATE TYPE "AuthIdentityProvider"');
    expect(migration).toContain('ADD COLUMN "disabled_at"');
    expect(schema).toContain('@@unique([provider, providerSubject])');
    expect(migration).toContain('ALTER COLUMN "canonical_email" DROP NOT NULL');
    expect(schema).toContain('userProfileId          String               @map("profile_id")');
  });
});
