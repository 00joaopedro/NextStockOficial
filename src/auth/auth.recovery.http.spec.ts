import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import * as request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { PasswordRecoveryError } from './auth-provider';
import { AuthService } from './auth.service';
import { SupabaseAuthProvider } from './supabase-auth-provider';
import { ProductionExceptionFilter } from '../security/production-exception.filter';
import { Logger } from '@nestjs/common';

describe('Supabase recovery HTTP validation contract', () => {
  let app: NestFastifyApplication;
  const completePasswordRecovery = jest.fn();
  const authService = {
    resolveInternalProfileId: jest.fn().mockResolvedValue('profile-1'),
  };

  beforeAll(async () => {
    process.env.AUTH_PROVIDER_MODE = 'supabase_only';
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: SupabaseAuthProvider, useValue: { completePasswordRecovery } },
      ],
    })
      .overrideGuard(AuthRateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    app.useGlobalFilters(new ProductionExceptionFilter());
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await app.close();
    delete process.env.AUTH_PROVIDER_MODE;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    completePasswordRecovery.mockResolvedValue({ id: 'supabase-user-1' });
  });

  const validBody = () => ({
    accessToken: 'a'.repeat(20),
    refreshToken: 'opaque-refresh-token',
    recoveryType: 'recovery',
    newPassword: 'Strong-password-123',
  });

  it('payload válido, access sintético e refresh opaco chegam ao provider', async () => {
    await request(app.getHttpServer())
      .post('/auth/reset-password/supabase')
      .send(validBody())
      .expect(201);
    expect(completePasswordRecovery).toHaveBeenCalledWith({
      accessToken: 'a'.repeat(20),
      refreshToken: 'opaque-refresh-token',
      newPassword: 'Strong-password-123',
    });
  });

  it('aceita refresh tokens opacos nao vazios abaixo do antigo minimo de 20', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    for (const size of [1, 5, 19, 20, 128]) {
      await request(app.getHttpServer()).post('/auth/reset-password/supabase')
        .send({ ...validBody(), refreshToken: 'r'.repeat(size) }).expect(201);
    }
    expect(completePasswordRecovery).toHaveBeenCalledTimes(5);
    expect(warn.mock.calls.flat().join(' ')).not.toContain('RECOVERY_DTO_INVALID');
    warn.mockRestore();
  });

  it('mantem refresh obrigatorio, nao vazio e limitado ao maximo defensivo', async () => {
    const missing = validBody();
    delete (missing as Partial<typeof missing>).refreshToken;
    for (const body of [
      { ...validBody(), refreshToken: '' },
      missing,
      { ...validBody(), refreshToken: 'r'.repeat(4097) },
    ]) {
      await request(app.getHttpServer()).post('/auth/reset-password/supabase')
        .send(body).expect(400);
    }
    expect(completePasswordRecovery).not.toHaveBeenCalled();
  });

  it('mantem access obrigatorio e recoveryType estrito', async () => {
    const missingAccess = validBody();
    delete (missingAccess as Partial<typeof missingAccess>).accessToken;
    await request(app.getHttpServer()).post('/auth/reset-password/supabase')
      .send(missingAccess).expect(400);
    await request(app.getHttpServer()).post('/auth/reset-password/supabase')
      .send({ ...validBody(), recoveryType: 'reset' }).expect(400);
    expect(completePasswordRecovery).not.toHaveBeenCalled();
  });

  it('aceita corpo sintetico proximo ao tamanho observado em producao', async () => {
    const body = { ...validBody(), accessToken: 'a'.repeat(1800), refreshToken: 'r'.repeat(1200) };
    expect(Buffer.byteLength(JSON.stringify(body), 'utf8')).toBeGreaterThan(3000);
    await request(app.getHttpServer()).post('/auth/reset-password/supabase')
      .send(body).expect(201);
    expect(completePasswordRecovery).toHaveBeenCalledTimes(1);
  });

  it('campo ausente e campo extra são rejeitados pelo contrato global', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const missing = validBody();
    delete (missing as Partial<typeof missing>).refreshToken;
    await request(app.getHttpServer())
      .post('/auth/reset-password/supabase')
      .send(missing)
      .expect(400);
    await request(app.getHttpServer())
      .post('/auth/reset-password/supabase')
      .send({ ...validBody(), unexpected: true })
      .expect(400);
    expect(completePasswordRecovery).not.toHaveBeenCalled();
    const output = warn.mock.calls.flat().join(' ');
    expect(output).toContain('RECOVERY_BODY_FIELD_MISSING');
    expect(output).toContain('refreshToken');
    expect(output).not.toContain('opaque-refresh-token');
    warn.mockRestore();
  });

  it('senha abaixo da política retorna 422 sem chamar provider', async () => {
    await request(app.getHttpServer())
      .post('/auth/reset-password/supabase')
      .send({ ...validBody(), newPassword: 'short' })
      .expect(422);
    expect(completePasswordRecovery).not.toHaveBeenCalled();
  });

  it.each([
    ['123456', 201],
    ['1'.repeat(128), 201],
    ['1'.repeat(129), 400],
  ] as const)('aplica as fronteiras de senha Supabase (%s)', async (newPassword, status) => {
    await request(app.getHttpServer())
      .post('/auth/reset-password/supabase')
      .send({ ...validBody(), newPassword })
      .expect(status);
    if (status === 201) expect(completePasswordRecovery).toHaveBeenCalled();
  });

  it.each([
    ['invalid_credentials', 401, 'RECOVERY_LINK_INVALID'],
    ['password_policy', 422, 'PASSWORD_POLICY_REJECTED'],
    ['provider_unavailable', 503, 'RECOVERY_PROVIDER_UNAVAILABLE'],
  ] as const)('provider %s mantém o contrato HTTP', async (code, status, publicCode) => {
    completePasswordRecovery.mockRejectedValueOnce(
      new PasswordRecoveryError(
        code,
        code === 'invalid_credentials'
          ? 'RECOVERY_SET_SESSION_INVALID'
          : code === 'password_policy'
            ? 'RECOVERY_PASSWORD_POLICY_REJECTED'
            : 'RECOVERY_SET_SESSION_FAILED',
        code === 'provider_unavailable' ? 0 : 400,
      ),
    );
    const response = await request(app.getHttpServer())
      .post('/auth/reset-password/supabase')
      .send(validBody())
      .expect(status);
    expect(response.body.code).toBe(publicCode);
    expect(JSON.stringify(response.body)).not.toContain('a'.repeat(20));
    expect(JSON.stringify(response.body)).not.toContain('opaque-refresh-token');
  });
});
