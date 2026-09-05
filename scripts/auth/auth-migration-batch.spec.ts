import { planBatch } from './auth-migration-batch';

const records = [
  {
    sourceProvider: 'supabase',
    sourceSubject: 'subject-c',
    profileId: 'profile-c',
  },
  {
    sourceProvider: 'supabase',
    sourceSubject: 'subject-a',
    profileId: 'profile-a',
  },
  {
    sourceProvider: 'unknown',
    sourceSubject: 'subject-b',
    profileId: 'profile-b',
  },
];

describe('auth migration batch planning', () => {
  const originalSecret = process.env.AUTH_MIGRATION_CURSOR_SECRET;

  beforeAll(() => {
    process.env.AUTH_MIGRATION_CURSOR_SECRET = 'test-cursor-secret';
  });

  afterAll(() => {
    if (originalSecret === undefined)
      delete process.env.AUTH_MIGRATION_CURSOR_SECRET;
    else process.env.AUTH_MIGRATION_CURSOR_SECRET = originalSecret;
  });

  it('plans the first page deterministically and without mutations', () => {
    const report = planBatch(records, 2);
    expect(report).toMatchObject({
      mode: 'dry-run',
      dryRun: true,
      scanned: 2,
      mutations: 0,
    });
    expect(report.cursor).toEqual(expect.any(String));
    expect(JSON.stringify(report)).not.toContain('subject');
    expect(JSON.stringify(report)).not.toContain('profile');
  });

  it('resumes from the emitted cursor without overlap', () => {
    const first = planBatch(records, 1);
    const second = planBatch(records, 1, first.cursor ?? undefined);
    const third = planBatch(records, 1, second.cursor ?? undefined);
    expect(first.scanned + second.scanned + third.scanned).toBe(3);
    expect(third.cursor).toEqual(expect.any(String));
    expect(planBatch(records, 1, third.cursor ?? undefined).scanned).toBe(0);
  });

  it('rejects invalid, unknown, duplicate, and oversized cursors/batches', () => {
    expect(() => planBatch(records, 1, 'invalid')).toThrow('INVALID_CURSOR');
    expect(() => planBatch(records, 101)).toThrow('INVALID_BATCH_SIZE');
    expect(() => planBatch([{ ...records[0] }, { ...records[0] }], 1)).toThrow(
      'DUPLICATE_RECORD_KEY',
    );
  });

  it('keeps the final page smaller than the requested batch size', () => {
    const report = planBatch(records, 100);
    expect(report.scanned).toBe(3);
    expect(planBatch(records, 100, report.cursor ?? undefined).scanned).toBe(0);
  });
});
