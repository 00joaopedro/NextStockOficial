import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { PrismaService } from './prisma/prisma.service';
import { PreviewMutationGuard } from './system/guards/preview-mutation.guard';
import { AuthRateLimitGuard } from './auth/auth-rate-limit.guard';
import { AuthRateLimitStore } from './auth/auth-rate-limit.store';
import { ObservabilityService } from './observability/observability.service';

jest.mock('jwks-rsa', () => ({ passportJwtSecret: jest.fn() }));

describe('AppModule bootstrap', () => {
  it('inicializa o grafo real sem abrir porta e resolve guards e dependencias', async () => {
    Object.assign(process.env, {
      APP_ENV: 'test',
      NODE_ENV: 'test',
      DATABASE_URL:
        'postgresql://test:test@127.0.0.1:5432/nextstock_bootstrap_test?schema=public',
      DIRECT_URL:
        'postgresql://test:test@127.0.0.1:5432/nextstock_bootstrap_test?schema=public',
      ADMIN_DATABASE_URL: '',
      SUPABASE_URL: 'http://local-test.localhost',
      SUPABASE_PROJECT_REF: 'local-test',
      SUPABASE_ANON_KEY: 'test-anon-key-at-least-twenty-characters',
      SUPABASE_SERVICE_ROLE_KEY:
        'test-service-role-key-at-least-twenty-characters',
      AUTH_RATE_LIMIT_HMAC_SECRET:
        'test-auth-rate-limit-secret-at-least-thirty-two-characters',
      CERT_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
      CERT_ENCRYPTION_KEY_VERSION: 'test-v1',
    });
    const { AppModule } = await import('./app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    const app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    await expect(app.init()).resolves.toBeDefined();
    expect(app.get(PreviewMutationGuard)).toBeInstanceOf(PreviewMutationGuard);
    const rateLimitGuard = app.get(AuthRateLimitGuard);
    const rateLimitStore = app.get(AuthRateLimitStore);
    const observability = app.get(ObservabilityService);
    expect(rateLimitGuard).toBeInstanceOf(AuthRateLimitGuard);
    expect(rateLimitStore).toBeInstanceOf(AuthRateLimitStore);
    expect(observability).toBeInstanceOf(ObservabilityService);
    expect(moduleRef.get(AuthRateLimitGuard)).toBe(rateLimitGuard);

    await app.close();
  });
});
