import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { SchemaCompatibilityService } from './schema-compatibility.service';

describe('HealthController', () => {
  it('keeps liveness simple and does not call readiness or Prisma', () => {
    const schemaCompatibility = { check: jest.fn() };
    const controller = new HealthController(schemaCompatibility as any);

    expect(controller.health()).toEqual({ status: 'ok' });
    expect(schemaCompatibility.check).not.toHaveBeenCalled();
  });

  it('returns sanitized ready response only when schema is compatible', async () => {
    const schemaCompatibility = {
      check: jest.fn().mockResolvedValue({ ready: true, durationMs: 12 }),
    };
    const controller = new HealthController(schemaCompatibility as any);

    await expect(controller.readiness()).resolves.toEqual({ status: 'ready' });
  });

  it('rejects readiness with sanitized schema reason', async () => {
    const schemaCompatibility = {
      check: jest.fn().mockResolvedValue({
        ready: false,
        reason: 'schema_incompatible',
        internalCode: 'marker_missing',
        durationMs: 10,
      }),
    };
    const controller = new HealthController(schemaCompatibility as any);

    await expect(controller.readiness()).rejects.toMatchObject({
      status: 503,
      response: { status: 'not_ready', reason: 'schema_incompatible' },
    });
  });

  it('rejects readiness with sanitized timeout reason', async () => {
    const schemaCompatibility = {
      check: jest.fn().mockResolvedValue({
        ready: false,
        reason: 'readiness_timeout',
        internalCode: 'readiness_timeout',
        durationMs: 250,
      }),
    } satisfies Partial<SchemaCompatibilityService>;
    const controller = new HealthController(schemaCompatibility as any);

    await expect(controller.readiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
