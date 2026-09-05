import { PrismaClient } from '@prisma/client';
import { Reflector } from '@nestjs/core';
import { AuthRateLimitStore } from '../../src/auth/auth-rate-limit.store';
import {
  AuthRateLimitGuard,
  normalizeIp,
  resolveAuthRateLimitAction,
} from '../../src/auth/auth-rate-limit.guard';
import { ObservabilityService } from '../../src/observability/observability.service';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthService } from '../../src/auth/auth.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import fastifyCookie from '@fastify/cookie';

const databaseUrl = process.env.SECURITY_TEST_DATABASE_URL;

describe('SEC-016 distributed authentication rate limiter', () => {
  let firstClient: PrismaClient;
  let secondClient: PrismaClient;
  let first: AuthRateLimitStore;
  let second: AuthRateLimitStore;

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_HMAC_SECRET =
      'test-auth-rate-limit-secret-at-least-thirty-two-characters';
    firstClient = new PrismaClient({ datasourceUrl: databaseUrl });
    secondClient = new PrismaClient({ datasourceUrl: databaseUrl });
    first = new AuthRateLimitStore(firstClient as any);
    second = new AuthRateLimitStore(secondClient as any);
    await firstClient.$connect();
    await secondClient.$connect();
  });

  beforeEach(async () => {
    await firstClient.authRateLimitBucket.deleteMany();
  });

  afterAll(async () => {
    await firstClient.authRateLimitBucket.deleteMany();
    await Promise.all([firstClient.$disconnect(), secondClient.$disconnect()]);
  });

  const consume = (
    store: AuthRateLimitStore,
    suffix: string,
    overrides: Partial<Parameters<AuthRateLimitStore['consume']>[0]> = {},
  ) =>
    store.consume({
      action: `POST:/api/auth/login:${suffix}`,
      ip: '203.0.113.7',
      account: 'user@example.test',
      max: 5,
      windowMs: 60_000,
      now: new Date('2026-08-04T12:00:01.000Z'),
      ...overrides,
    });

  it.each([2, 20, 100])(
    'allows exactly five of %i concurrent attempts across two independent replicas without P2002/500',
    async (attempts) => {
      const results = await Promise.all(
        Array.from({ length: attempts }, (_, index) =>
          consume(index % 2 ? first : second, `concurrency-${attempts}`),
        ),
      );
      expect(results.filter((result) => result.allowed)).toHaveLength(
        Math.min(5, attempts),
      );
      expect(results.filter((result) => !result.allowed)).toHaveLength(
        Math.max(0, attempts - 5),
      );
    },
  );

  it('shares quota across alternating replicas and a new logical instance after restart', async () => {
    const results: Array<{ allowed: boolean }> = [];
    for (let index = 0; index < 5; index += 1) {
      results.push(await consume(index % 2 ? first : second, 'restart'));
    }
    const restarted = new AuthRateLimitStore(secondClient as any);
    results.push(await consume(restarted, 'restart'));
    expect(results.map((result) => result.allowed)).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
    ]);
  });

  it('separates actions, IPs and accounts while enforcing account across IPs and IP across accounts', async () => {
    for (let index = 0; index < 5; index += 1) await consume(first, 'scopes');
    await expect(consume(second, 'scopes')).resolves.toMatchObject({
      allowed: false,
    });
    await expect(consume(second, 'other-action')).resolves.toMatchObject({
      allowed: true,
    });
    await expect(
      consume(second, 'scopes', { ip: '203.0.113.8' }),
    ).resolves.toMatchObject({
      allowed: false,
      blockedBy: 'ACCOUNT',
    });
    await expect(
      consume(second, 'scopes', { account: 'other@example.test' }),
    ).resolves.toMatchObject({ allowed: false, blockedBy: 'IP' });
  });

  it('uses canonical account input, renews expired windows, returns Retry-After data and cleans only expired rows', async () => {
    for (let index = 0; index < 5; index += 1) {
      await consume(first, 'canonical', { account: 'user@example.test' });
    }
    const blocked = await consume(second, 'canonical', {
      account: 'user@example.test',
    });
    expect(blocked).toMatchObject({ allowed: false, retryAfterSeconds: 59 });
    await expect(
      consume(second, 'canonical', {
        now: new Date('2026-08-04T12:01:01.000Z'),
      }),
    ).resolves.toMatchObject({ allowed: true });
    expect(
      await first.cleanupExpired(500, new Date('2026-08-04T12:01:00.500Z')),
    ).toBe(2);
    expect(await firstClient.authRateLimitBucket.count()).toBe(2);
  });

  it('normalizes IPv4, mapped IPv4 and equivalent IPv6 without merging different IPv6 addresses', () => {
    expect(normalizeIp('192.0.2.10')).toBe(normalizeIp('::ffff:192.0.2.10'));
    expect(normalizeIp('2001:db8::1')).toBe(
      normalizeIp('2001:0DB8:0:0:0:0:0:1'),
    );
    expect(normalizeIp('2001:db8::1')).not.toBe(normalizeIp('2001:db8::2'));
    expect(normalizeIp('malformed forwarded value')).toBe('unknown');
  });

  it('keeps real auth routes in distinct sanitized action buckets', () => {
    const actions = [
      resolveAuthRateLimitAction({ method: 'POST', path: '/auth/login' }),
      resolveAuthRateLimitAction({ method: 'POST', path: '/auth/register' }),
      resolveAuthRateLimitAction({
        method: 'POST',
        url: '/auth/forgot-password?email=synthetic',
      }),
    ];
    expect(new Set(actions).size).toBe(3);
    expect(actions).toEqual([
      'POST:/auth/login',
      'POST:/auth/register',
      'POST:/auth/forgot-password',
    ]);
    expect(actions.some((action) => action.includes('undefined'))).toBe(false);
  });

  it('fails closed with sanitized 503 when PostgreSQL is unavailable', async () => {
    const failing = {
      consume: jest.fn().mockRejectedValue(new Error('database unavailable')),
    };
    const logs: unknown[] = [];
    const guard = new AuthRateLimitGuard(
      {
        getAllAndOverride: () => ({
          max: 5,
          windowMs: 60_000,
          includeEmail: true,
        }),
      } as unknown as Reflector,
      failing as any,
      {
        log: (event: unknown) => {
          logs.push(event);
        },
      } as unknown as ObservabilityService,
    );
    const context = {
      getHandler: () => null,
      getClass: () => null,
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          path: '/auth/login',
          ip: '192.0.2.1',
          body: { email: 'secret@example.test', password: 'secret' },
        }),
        getResponse: () => ({ header: jest.fn() }),
      }),
    } as any;
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 503,
    });
    expect(JSON.stringify(logs)).not.toContain('secret@example.test');
    expect(JSON.stringify(logs)).not.toContain('192.0.2.1');
  });

  it('exercises the real login, register and recovery controller routes without Supabase', async () => {
    const fakeAuth = {
      login: jest.fn().mockResolvedValue({
        accessToken: 'invalid.test.token',
        payload: { user: { id: 'profile-test' }, selectedBranch: null },
      }),
      register: jest.fn().mockResolvedValue({
        accessToken: 'invalid.test.token',
        payload: { user: { id: 'profile-test' }, selectedBranch: null },
      }),
      forgotPassword: jest.fn().mockResolvedValue({
        message: 'Password recovery email requested.',
      }),
    };
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthRateLimitGuard,
        AuthRateLimitStore,
        Reflector,
        ObservabilityService,
        { provide: AuthService, useValue: fakeAuth },
        { provide: PrismaService, useValue: firstClient },
      ],
    }).compile();
    const app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ trustProxy: 0 }),
    );
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.register(fastifyCookie);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    try {
      const passwordFixture = 'Password1234';
      const loginPayload = {
        email: 'HTTP@Example.Test',
        password: passwordFixture,
      };
      const performLogin = () =>
        app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: loginPayload,
        });
      type LoginResponse = Awaited<ReturnType<typeof performLogin>>;
      const loginResponses: LoginResponse[] = [];
      for (let attempt = 0; attempt < 6; attempt += 1) {
        loginResponses.push(await performLogin());
      }
      const loginDiagnostics = loginResponses.map((response, index) => ({
        index,
        route: 'login',
        statusCode: response.statusCode,
        response: sanitizedResponseBody(response.body),
        hasRetryAfter: typeof response.headers['retry-after'] === 'string',
      }));
      expect(
        loginDiagnostics.filter(({ statusCode }) => statusCode === 500),
      ).toEqual([]);
      expect(
        loginDiagnostics.every(({ statusCode }) => statusCode !== 500),
      ).toBe(true);
      expect(loginResponses.map((response) => response.statusCode)).toEqual([
        201, 201, 201, 201, 201, 429,
      ]);
      expect(loginResponses[5].headers['retry-after']).toBeDefined();
      expect(fakeAuth.login).toHaveBeenCalledTimes(5);

      const register = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'register@example.test',
          name: 'Test User',
          companyName: 'Test Company',
          password: passwordFixture,
          systemType: 'padrao',
        },
      });
      const recovery = await app.inject({
        method: 'POST',
        url: '/auth/forgot-password',
        payload: { email: 'missing@example.test' },
      });
      expect(register.statusCode).toBe(201);
      expect(recovery.statusCode).toBe(201);
      expect(fakeAuth.register).toHaveBeenCalledTimes(1);
      expect(fakeAuth.forgotPassword).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
      await module.close();
    }
  });
});

function sanitizedResponseBody(body: string) {
  try {
    const parsed = JSON.parse(body) as {
      statusCode?: number;
      error?: string;
      message?: string;
    };
    return {
      statusCode: parsed.statusCode,
      hasError: typeof parsed.error === 'string',
      hasMessage: typeof parsed.message === 'string',
    };
  } catch {
    return { bodyType: body ? 'non-json' : 'empty' };
  }
}
