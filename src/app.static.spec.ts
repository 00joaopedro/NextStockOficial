import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { RequestMethod } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from './prisma/prisma.service';

jest.mock('jwks-rsa', () => ({
  passportJwtSecret: jest.fn(
    () =>
      (
        _request: unknown,
        _rawToken: string,
        done: (error: Error | null, secret?: string | Buffer) => void,
      ) => {
        done(
          new Error('JWKS is not available in the static delivery test.'),
        );
      },
  ),
}));

describe('public static delivery', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    Object.assign(process.env, {
      APP_ENV: 'test',
      NODE_ENV: 'test',
      NEXTSTOCK_PROCESS_ROLE: 'api',
      DATABASE_URL:
        'postgresql://test:test@127.0.0.1:5432/nextstock_static_test?schema=public',
      DIRECT_URL: '',
      ADMIN_DATABASE_URL: '',
      SUPABASE_URL: 'http://local-test.localhost',
      SUPABASE_PROJECT_REF: 'local-test',
      SUPABASE_ANON_KEY: 'test-anon-key-at-least-twenty-characters',
      SUPABASE_SERVICE_ROLE_KEY:
        'test-service-role-key-at-least-twenty-characters',
      SUPABASE_JWT_SECRET: 'test-jwt-secret-at-least-twenty-characters',
      AUTH_RATE_LIMIT_HMAC_SECRET:
        'test-auth-rate-limit-secret-at-least-thirty-two-characters',
      CERT_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
      CERT_ENCRYPTION_KEY_VERSION: 'test-v1',
    });

    const { AppModule } = await import('./app.module');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    // Keep public static delivery and the API prefix aligned with src/main.ts.
    app.setGlobalPrefix('api', {
      exclude: [
        { path: 'dev.html', method: RequestMethod.GET },
        { path: 'parceiros.html', method: RequestMethod.GET },
        { path: 'loja/:slug', method: RequestMethod.GET },
      ],
    });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    const fastify = app.getHttpAdapter().getInstance();
    console.log('STATIC_DIAGNOSTIC', {
      cwd: process.cwd(),
      testDir: __dirname,
      sendFile: fastify.hasDecorator('sendFile'),
      routes: fastify.printRoutes(),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(['/index.html', '/cadastro.html'])(
    'serves %s as HTML without a runtime error',
    async (path) => {
      const response = await app.inject({ method: 'GET', url: path });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/html/);
      expect(response.body).toContain('<html');
    },
  );

  it('serves the public root and a real JavaScript asset', async () => {
    const root = await app.inject({ method: 'GET', url: '/' });
    const asset = await app.inject({
      method: 'GET',
      url: '/dist/session-state.js',
    });

    expect(root.statusCode).toBe(200);
    expect(root.headers['content-type']).toMatch(/text\/html/);
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['content-type']).toMatch(/javascript|typescript|text/);
  });

  it('keeps the AppController JSON route under the API prefix', async () => {
    const apiRoot = await app.inject({ method: 'GET', url: '/api' });

    expect(apiRoot.statusCode).toBe(200);
    expect(apiRoot.headers['content-type']).toMatch(/application\/json/);
    expect(apiRoot.headers['content-type']).not.toMatch(/text\/html/);
  });

  it('does not turn a missing favicon or route into a TypeError response', async () => {
    const favicon = await app.inject({ method: 'GET', url: '/favicon.ico' });
    const missing = await app.inject({ method: 'GET', url: '/does-not-exist' });
    const missingApi = await app.inject({
      method: 'GET',
      url: '/api/does-not-exist',
    });

    expect(favicon.statusCode).not.toBe(500);
    expect(missing.statusCode).not.toBe(500);
    expect(missingApi.statusCode).not.toBe(500);
    expect(missingApi.headers['content-type']).not.toMatch(/text\/html/);
  });

  it('keeps health endpoints and traversal protection outside the static fallback', async () => {
    const health = await app.inject({ method: 'GET', url: '/api/health' });
    const readiness = await app.inject({
      method: 'GET',
      url: '/api/health/ready',
    });
    const traversal = await app.inject({
      method: 'GET',
      url: '/../../package.json',
    });

    expect(health.statusCode).not.toBe(500);
    expect(readiness.statusCode).not.toBe(500);
    expect(traversal.statusCode).not.toBe(200);
    expect(traversal.body).not.toContain('"dependencies"');
  });
});
