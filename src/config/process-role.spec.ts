import { processRole, startsApi, startsAuditWorker } from './process-role';

describe('process roles', () => {
  it('defaults to Railway-compatible all', () => expect(processRole({})).toBe('all'));
  it('separates API and worker', () => {
    expect(startsApi('api')).toBe(true);
    expect(startsAuditWorker('api')).toBe(false);
    expect(startsApi('audit-worker')).toBe(false);
    expect(startsAuditWorker('audit-worker')).toBe(true);
    expect(startsApi('all')).toBe(true);
    expect(startsAuditWorker('all')).toBe(true);
  });
  it('rejects invalid roles', () => expect(() => processRole({ NEXTSTOCK_PROCESS_ROLE: 'bogus' })).toThrow('Invalid NEXTSTOCK_PROCESS_ROLE'));
});
