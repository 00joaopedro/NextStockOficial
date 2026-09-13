import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { AuthRateLimitGuard } from '../src/auth/auth-rate-limit.guard';
import { GoogleOAuthService } from '../src/auth/google-oauth.service';

describe('Google OAuth HTTP redirects (Fastify)', () => {
  let app: NestFastifyApplication;
  const google = {
    start: jest.fn(),
    callback: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: {} },
        { provide: GoogleOAuthService, useValue: google },
        { provide: AuthRateLimitGuard, useValue: { canActivate: () => true } },
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.register(fastifyCookie);
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => app.close());

  beforeEach(() => jest.clearAllMocks());

  it('emits a real 302 to Google without following it', async () => {
    google.start.mockResolvedValue(
      'https://accounts.google.com/o/oauth2/v2/auth?client_id=test&prompt=select_account',
    );
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/google/start',
    });
    expect(response.statusCode).toBe(302);
    expect(response.statusCode).not.toBe(200);
    expect(new URL(response.headers.location as string).hostname).toBe(
      'accounts.google.com',
    );
    expect(response.body).not.toMatch(
      /code|state|nonce|challenge|secret|token/i,
    );
  });

  it('emits a finalized 302 with a public internal destination on success', async () => {
    google.callback.mockResolvedValue({
      kind: 'session',
      accessToken: 'a.b.c',
      user: { id: 'profile-1' },
      redirectTo: '/produtos.html',
    });
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/google/callback?code=fixture-code&state=fixture-state',
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/produtos.html');
    expect(response.headers['set-cookie']).toBeDefined();
  });

  it('emits a sanitized 302 on an invalid callback', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/google/callback?code=&state=fixture-state',
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/?auth_error=auth_failed');
    expect(response.headers.location).not.toMatch(/code|state|nonce|token/i);
  });
});
