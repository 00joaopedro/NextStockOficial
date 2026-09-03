import { planBatch } from './auth-migration-batch';

describe('auth migration batch planning', () => {
  it('is dry-run and emits only sanitized counts', async () => {
    const report = await planBatch([
      { sourceProvider: 'supabase', sourceSubject: 'subject', profileId: 'profile' },
      { sourceProvider: 'unknown', sourceSubject: 'secret', profileId: 'profile' },
    ], 20);
    expect(report).toMatchObject({ mode: 'dry-run', dryRun: true, scanned: 2, eligible: 1, skipped: 1, mutations: 0 });
    expect(JSON.stringify(report)).not.toContain('subject');
    expect(JSON.stringify(report)).not.toContain('profile');
  });
});
