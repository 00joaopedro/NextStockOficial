import { Logger } from '@nestjs/common';
import {
  readinessDatabaseTimeoutMs,
  REQUIRED_SCHEMA_COMPATIBILITY_VERSION,
  SchemaCompatibilityService,
} from './schema-compatibility.service';

const compatibleRow = {
  marker_version: REQUIRED_SCHEMA_COMPATIBILITY_VERSION,
  tenants_table: 'tenants',
  marker_table: 'schema_compatibility_markers',
  audit_outbox_table: 'audit_outbox_events',
  auth_rate_limit_table: 'auth_rate_limit_buckets',
  upload_quota_reservations_table: 'upload_quota_reservations',
  audit_outbox_link_column: 'outbox_event_id',
};

function serviceWithRows(rows: unknown[]) {
  const execute = jest.fn().mockResolvedValue(1);
  const query = jest.fn().mockResolvedValue(rows);
  const prisma = {
    $transaction: jest.fn((callback: any) =>
      callback({ $executeRaw: execute, $queryRaw: query }),
    ),
  };
  return {
    service: new SchemaCompatibilityService(prisma as any),
    prisma,
    execute,
    query,
  };
}

describe('SchemaCompatibilityService', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    delete process.env.READINESS_DATABASE_TIMEOUT_MS;
  });

  it('accepts marker version equal to the required version', async () => {
    const { service, execute } = serviceWithRows([compatibleRow]);
    await expect(service.check()).resolves.toMatchObject({ ready: true });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('accepts marker version greater than the required version', async () => {
    const { service } = serviceWithRows([
      { ...compatibleRow, marker_version: 2 },
    ]);
    await expect(service.check()).resolves.toMatchObject({ ready: true });
  });

  it.each([
    [
      'version lower than required',
      [{ ...compatibleRow, marker_version: 0 }],
      'marker_lower_than_required',
    ],
    [
      'marker absent',
      [{ ...compatibleRow, marker_version: null }],
      'marker_missing',
    ],
    ['table absent', [], 'marker_missing'],
    [
      'invalid version',
      [{ ...compatibleRow, marker_version: Number.NaN }],
      'marker_lower_than_required',
    ],
    [
      'canary absent',
      [{ ...compatibleRow, audit_outbox_table: null }],
      'structural_canary_failure',
    ],
  ])('returns not ready when %s', async (_name, rows, internalCode) => {
    const { service } = serviceWithRows(rows as unknown[]);
    await expect(service.check()).resolves.toMatchObject({
      ready: false,
      reason: 'schema_incompatible',
      internalCode,
    });
  });

  it('maps database errors to not ready without exposing details', async () => {
    const prisma = {
      $transaction: jest
        .fn()
        .mockRejectedValue(new Error('postgres://secret-host/db failed')),
    };
    const service = new SchemaCompatibilityService(prisma as any);

    await expect(service.check()).resolves.toMatchObject({
      ready: false,
      reason: 'database_unavailable',
    });
    expect(warnSpy.mock.calls.flat().join(' ')).not.toContain('secret-host');
  });

  it('maps statement timeout errors to readiness_timeout', async () => {
    const prisma = {
      $transaction: jest
        .fn()
        .mockRejectedValue(
          new Error('canceling statement due to statement timeout'),
        ),
    };
    const service = new SchemaCompatibilityService(prisma as any);

    await expect(service.check()).resolves.toMatchObject({
      ready: false,
      reason: 'readiness_timeout',
    });
  });

  it('clamps the configurable timeout into the safe range', () => {
    process.env.READINESS_DATABASE_TIMEOUT_MS = '50';
    expect(readinessDatabaseTimeoutMs()).toBe(250);
    process.env.READINESS_DATABASE_TIMEOUT_MS = '60000';
    expect(readinessDatabaseTimeoutMs()).toBe(5000);
    process.env.READINESS_DATABASE_TIMEOUT_MS = '2000';
    expect(readinessDatabaseTimeoutMs()).toBe(2000);
  });

  it('emits sanitized transition logs', async () => {
    const { service } = serviceWithRows([compatibleRow]);
    await service.check();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('readiness_state_transition'),
    );
  });

  it('uses only one read-only compatibility query after setting local statement timeout', async () => {
    const { service, execute, query } = serviceWithRows([compatibleRow]);
    await service.check();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
