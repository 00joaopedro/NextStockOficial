import { AuthController } from './auth.controller';
import { AuthProviderError, PasswordRecoveryError } from './auth-provider';
import { Logger } from '@nestjs/common';
import { RATE_LIMIT_KEY } from '../security/public-rate-limit.guard';
import type { AuthenticatedHttpRequest } from '../common/http-types';
import type { SupabaseResetPasswordDto } from './dto/supabase-reset-password.dto';

describe('AuthController', () => {
  const request = (): AuthenticatedHttpRequest => ({
    method: 'POST',
    headers: {},
    requestId: 'test-recovery-request',
    ip: '127.0.0.1',
    user: { id: 'profile-1' } as any,
  });
  const authService = {
    login: jest.fn(),
    register: jest.fn(),
    forgotPassword: jest.fn(),
  } as any;
  const response = () => {
    const reply = {
      setCookie: jest.fn(),
      clearCookie: jest.fn(),
      header: jest.fn(),
      code: jest.fn(),
      send: jest.fn(),
    };
    reply.code.mockReturnValue(reply);
    reply.header.mockReturnValue(reply);
    reply.send.mockReturnValue(reply);
    reply.setCookie.mockReturnValue(reply);
    reply.clearCookie.mockReturnValue(reply);
    return reply as any;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('login salva cookie jwt httpOnly', async () => {
    const controller = new AuthController(authService);
    const res = response();
    authService.login.mockResolvedValue({
      accessToken: 'token',
      payload: {
        message: 'Login realizado com sucesso.',
        redirectTo: 'produtos.html',
      },
    });

    await controller.login(
      { email: 'user@test.com', password: 'Senha123' },
      res,
    );

    expect(res.setCookie).toHaveBeenCalledWith(
      'jwt',
      'token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      }),
    );
  });

  it('register salva cookie jwt httpOnly', async () => {
    const controller = new AuthController(authService);
    const res = response();
    authService.register.mockResolvedValue({
      accessToken: 'token',
      payload: {
        message: 'Cadastro realizado com sucesso.',
        redirectTo: 'produtos.html',
      },
    });

    await controller.register(
      {
        email: 'user@test.com',
        name: 'User Teste',
        companyName: 'Empresa Teste',
        password: 'Senha123',
        systemType: 'padrao',
      },
      res,
    );

    expect(res.setCookie).toHaveBeenCalledWith(
      'jwt',
      'token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      }),
    );
  });

  it('login cria cookie de sessao opaco sem persistir token bruto', async () => {
    const sessions = {
      expiresAtFromJwt: jest.fn().mockReturnValue({
        expiresAt: new Date(Date.now() + 60_000),
        subject: 'auth-1',
      }),
      create: jest.fn().mockResolvedValue({
        id: 'session-1',
        token: 'opaque-session',
        expiresAt: new Date(Date.now() + 60_000),
      }),
      metadataFromRequest: jest.fn().mockReturnValue({}),
    };
    const controller = new AuthController(
      authService,
      undefined,
      sessions as any,
    );
    const res = response();
    authService.login.mockResolvedValue({
      accessToken: 'a.b.c',
      payload: {
        user: { id: 'profile-1', tenantId: 'tenant-1' },
        selectedBranch: null,
      },
    });
    await controller.login(
      { email: 'user@test.com', password: 'Senha123' },
      res,
      {} as any,
    );
    expect(sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: 'profile-1' }),
    );
    expect(res.setCookie).toHaveBeenCalledWith(
      'nextstock_session',
      'opaque-session',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax' }),
    );
  });

  it('logout revoga a sessao atual e limpa os dois cookies', async () => {
    const sessions = {
      revokeCurrent: jest.fn().mockResolvedValue(1),
      metadataFromRequest: jest.fn().mockReturnValue({}),
    };
    const controller = new AuthController(
      authService,
      undefined,
      sessions as any,
    );
    const res = response();
    await controller.logout(res, {
      cookies: { nextstock_session: 'opaque-session' },
    } as any);
    expect(sessions.revokeCurrent).toHaveBeenCalledWith(
      'opaque-session',
      'logout',
      {},
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      'jwt',
      expect.objectContaining({ path: '/' }),
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      'nextstock_session',
      expect.objectContaining({ path: '/' }),
    );
  });

  it('coexistence desabilitado delega recovery ao fluxo legado', async () => {
    const envKeys = [
      'APP_ENV',
      'AUTH_PROVIDER_MODE',
      'LOCAL_PASSWORD_RECOVERY_ENABLED',
      'SUPERTOKENS_CONNECTION_URI',
      'SUPERTOKENS_APP_NAME',
      'SUPERTOKENS_API_DOMAIN',
      'SUPERTOKENS_WEBSITE_DOMAIN',
    ] as const;
    const previousEnv = Object.fromEntries(
      envKeys.map((key) => [key, process.env[key]]),
    );
    Object.assign(process.env, {
      APP_ENV: 'test',
      AUTH_PROVIDER_MODE: 'coexistence',
      LOCAL_PASSWORD_RECOVERY_ENABLED: 'false',
      SUPERTOKENS_CONNECTION_URI: 'http://127.0.0.1:3567',
      SUPERTOKENS_APP_NAME: 'test',
      SUPERTOKENS_API_DOMAIN: 'http://localhost:3000',
      SUPERTOKENS_WEBSITE_DOMAIN: 'http://localhost:3000',
    });
    const lifecycle = { request: jest.fn() } as any;
    const audit = {
      fromRequest: jest.fn().mockReturnValue({}),
      record: jest.fn(),
    } as any;
    authService.forgotPassword.mockResolvedValue({ ok: true });
    try {
      await new AuthController(
        authService,
        audit,
        undefined,
        lifecycle,
      ).forgotPassword({ email: 'USER@Test.com' } as any, {} as any);
      expect(authService.forgotPassword).toHaveBeenCalledTimes(1);
      expect(lifecycle.request).not.toHaveBeenCalled();
    } finally {
      envKeys.forEach((key) => {
        const value = previousEnv[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      });
    }
  });

  it('coexistence habilitado usa somente o lifecycle local', async () => {
    const previousMode = process.env.AUTH_PROVIDER_MODE;
    const previousLocal = process.env.LOCAL_PASSWORD_RECOVERY_ENABLED;
    process.env.AUTH_PROVIDER_MODE = 'coexistence';
    process.env.LOCAL_PASSWORD_RECOVERY_ENABLED = 'true';
    const supertokens = {
      SUPERTOKENS_CONNECTION_URI: process.env.SUPERTOKENS_CONNECTION_URI,
      SUPERTOKENS_APP_NAME: process.env.SUPERTOKENS_APP_NAME,
      SUPERTOKENS_API_DOMAIN: process.env.SUPERTOKENS_API_DOMAIN,
      SUPERTOKENS_WEBSITE_DOMAIN: process.env.SUPERTOKENS_WEBSITE_DOMAIN,
    };
    Object.assign(process.env, {
      SUPERTOKENS_CONNECTION_URI: 'http://127.0.0.1:3567',
      SUPERTOKENS_APP_NAME: 'test',
      SUPERTOKENS_API_DOMAIN: 'http://localhost:3000',
      SUPERTOKENS_WEBSITE_DOMAIN: 'http://localhost:3000',
    });
    const lifecycle = {
      request: jest.fn().mockResolvedValue({ ok: true }),
    } as any;
    const audit = {
      fromRequest: jest.fn().mockReturnValue({}),
      record: jest.fn(),
    } as any;
    try {
      await new AuthController(
        authService,
        audit,
        undefined,
        lifecycle,
      ).forgotPassword({ email: 'USER@Test.com' } as any, {} as any);
      expect(lifecycle.request).toHaveBeenCalledTimes(1);
      expect(authService.forgotPassword).not.toHaveBeenCalled();
    } finally {
      process.env.AUTH_PROVIDER_MODE = previousMode;
      process.env.LOCAL_PASSWORD_RECOVERY_ENABLED = previousLocal;
      Object.entries(supertokens).forEach(([key, value]) => {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      });
    }
  });

  it('encaminha recuperação Supabase para o provider em supabase_only', async () => {
    const supabaseAuth = {
      completePasswordRecovery: jest
        .fn()
        .mockResolvedValue({ id: 'supabase-1' }),
      resetPasswordFromRecovery: jest.fn(),
    } as any;
    authService.resolveInternalProfileId = jest
      .fn()
      .mockResolvedValue('profile-1');
    const controller = new AuthController(
      authService,
      undefined,
      undefined,
      undefined,
      undefined,
      supabaseAuth,
    );
    const previousMode = process.env.AUTH_PROVIDER_MODE;
    process.env.AUTH_PROVIDER_MODE = 'supabase_only';
    try {
      await controller.resetSupabasePassword(
        {
          recoveryType: 'recovery',
          accessToken: 'a'.repeat(20),
          refreshToken: 'r'.repeat(20),
          newPassword: 'New-password-123',
        },
        request(),
      );
      expect(supabaseAuth.completePasswordRecovery).toHaveBeenCalledWith({
        accessToken: 'a'.repeat(20),
        refreshToken: 'r'.repeat(20),
        newPassword: 'New-password-123',
      });
      expect(supabaseAuth.resetPasswordFromRecovery).not.toHaveBeenCalled();
    } finally {
      if (previousMode === undefined) delete process.env.AUTH_PROVIDER_MODE;
      else process.env.AUTH_PROVIDER_MODE = previousMode;
    }
  });

  it('mantém endpoint Supabase indisponível para modo local', async () => {
    const supabaseAuth = { resetPasswordFromRecovery: jest.fn() } as any;
    const controller = new AuthController(
      authService,
      undefined,
      undefined,
      undefined,
      undefined,
      supabaseAuth,
    );
    const previousMode = process.env.AUTH_PROVIDER_MODE;
    const previousMigration = process.env.AUTH_MIGRATION_ENABLED;
    Object.assign(process.env, {
      AUTH_PROVIDER_MODE: 'local_only',
      AUTH_MIGRATION_ENABLED: 'true',
    });
    try {
      await expect(
        controller.resetSupabasePassword({} as any, request()),
      ).rejects.toMatchObject({ status: 401 });
      expect(supabaseAuth.resetPasswordFromRecovery).not.toHaveBeenCalled();
    } finally {
      if (previousMode === undefined) delete process.env.AUTH_PROVIDER_MODE;
      else process.env.AUTH_PROVIDER_MODE = previousMode;
      if (previousMigration === undefined)
        delete process.env.AUTH_MIGRATION_ENABLED;
      else process.env.AUTH_MIGRATION_ENABLED = previousMigration;
    }
  });

  it('mapeia somente password_policy para 422 sem expor erro do provider', async () => {
    const supabaseAuth = {
      completePasswordRecovery: jest
        .fn()
        .mockRejectedValue(new AuthProviderError('password_policy')),
    } as any;
    const controller = new AuthController(
      authService,
      undefined,
      undefined,
      undefined,
      undefined,
      supabaseAuth,
    );
    const previousMode = process.env.AUTH_PROVIDER_MODE;
    process.env.AUTH_PROVIDER_MODE = 'supabase_only';
    try {
      await expect(
        controller.resetSupabasePassword(
          {
            recoveryType: 'recovery',
            accessToken: 'a'.repeat(20),
            refreshToken: 'r'.repeat(20),
            newPassword: 'New-password-123',
          },
          request(),
        ),
      ).rejects.toMatchObject({
        status: 422,
        response: {
          code: 'PASSWORD_POLICY_REJECTED',
          message: 'A senha não atende à política exigida.',
        },
      });
    } finally {
      if (previousMode === undefined) delete process.env.AUTH_PROVIDER_MODE;
      else process.env.AUTH_PROVIDER_MODE = previousMode;
    }
  });

  it('mantém credenciais inválidas fora de 422 e sanitiza erro desconhecido', async () => {
    const supabaseAuth = {
      completePasswordRecovery: jest
        .fn()
        .mockRejectedValueOnce(new AuthProviderError('invalid_credentials'))
        .mockRejectedValueOnce(new Error('provider secret detail')),
    } as any;
    const controller = new AuthController(
      authService,
      undefined,
      undefined,
      undefined,
      undefined,
      supabaseAuth,
    );
    const previousMode = process.env.AUTH_PROVIDER_MODE;
    process.env.AUTH_PROVIDER_MODE = 'supabase_only';
    const body: SupabaseResetPasswordDto = {
      recoveryType: 'recovery',
      accessToken: 'a'.repeat(20),
      refreshToken: 'r'.repeat(20),
      newPassword: 'New-password-123',
    };
    try {
      await expect(
        controller.resetSupabasePassword(body, request()),
      ).rejects.toMatchObject({ status: 401 });
      await expect(
        controller.resetSupabasePassword(body, request()),
      ).rejects.toMatchObject({
        status: 500,
        response: {
          code: 'RECOVERY_FAILED',
          message: 'Não foi possível redefinir a senha.',
        },
      });
    } finally {
      if (previousMode === undefined) delete process.env.AUTH_PROVIDER_MODE;
      else process.env.AUTH_PROVIDER_MODE = previousMode;
    }
  });

  it('maps recovery diagnostics to public status codes without logging credentials', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const supabaseAuth = {
      completePasswordRecovery: jest
        .fn()
        .mockRejectedValueOnce(
          new PasswordRecoveryError(
            'invalid_credentials',
            'RECOVERY_SET_SESSION_FAILED',
            401,
            'bad_jwt',
          ),
        )
        .mockRejectedValueOnce(
          new PasswordRecoveryError(
            'provider_unavailable',
            'RECOVERY_UPDATE_USER_FAILED',
            0,
            'fetch_error',
          ),
        ),
    } as any;
    const controller = new AuthController(
      authService,
      undefined,
      undefined,
      undefined,
      undefined,
      supabaseAuth,
    );
    const previousMode = process.env.AUTH_PROVIDER_MODE;
    process.env.AUTH_PROVIDER_MODE = 'supabase_only';
    const body: SupabaseResetPasswordDto = {
      recoveryType: 'recovery',
      accessToken: 'access-secret-token',
      refreshToken: 'refresh-secret-token',
      newPassword: 'password-secret',
    };
    try {
      await expect(
        controller.resetSupabasePassword(body, request()),
      ).rejects.toMatchObject({
        status: 401,
        response: { code: 'RECOVERY_LINK_INVALID' },
      });
      await expect(
        controller.resetSupabasePassword(body, request()),
      ).rejects.toMatchObject({
        status: 503,
        response: { code: 'RECOVERY_PROVIDER_UNAVAILABLE' },
      });
      const output = warn.mock.calls.flat().join(' ');
      expect(output).toContain('RECOVERY_SET_SESSION_FAILED');
      expect(output).not.toContain(body.accessToken);
      expect(output).not.toContain(body.refreshToken);
      expect(output).not.toContain(body.newPassword);
    } finally {
      warn.mockRestore();
      if (previousMode === undefined) delete process.env.AUTH_PROVIDER_MODE;
      else process.env.AUTH_PROVIDER_MODE = previousMode;
    }
  });

  it('reports a completed password reset when Supabase sign-out is pending and still revokes internal sessions', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const sessions = {
      revokeAllForProfile: jest.fn().mockResolvedValue(3),
      metadataFromRequest: jest.fn().mockReturnValue({ requestId: 'test-recovery-request' }),
    };
    const audit = { fromRequest: jest.fn().mockReturnValue({}), record: jest.fn() } as any;
    const supabaseAuth = {
      completePasswordRecovery: jest.fn().mockResolvedValue({
        id: 'supabase-1',
        recoverySessionRevoked: false,
        recoveryDiagnosticCode: 'RECOVERY_GLOBAL_SIGNOUT_FAILED',
        recoveryProviderStatus: 503,
        recoveryProviderCode: 'network_error',
      }),
    } as any;
    authService.resolveInternalProfileId = jest.fn().mockResolvedValue('profile-1');
    const controller = new AuthController(authService, audit, sessions as any, undefined, undefined, supabaseAuth);
    const previousMode = process.env.AUTH_PROVIDER_MODE;
    process.env.AUTH_PROVIDER_MODE = 'supabase_only';
    try {
      await expect(controller.resetSupabasePassword({
        recoveryType: 'recovery', accessToken: 'access-secret-token', refreshToken: 'refresh-secret-token', newPassword: 'password-secret',
      }, request())).resolves.toEqual({
        ok: true,
        code: 'RECOVERY_PASSWORD_UPDATED_SESSION_REVOCATION_PENDING',
      });
      expect(sessions.revokeAllForProfile).toHaveBeenCalledWith(
        'profile-1', 'password_recovery', { requestId: 'test-recovery-request' },
      );
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
        metadata: expect.objectContaining({ supabaseRecoverySessionRevoked: false, recoveryDiagnosticCode: 'RECOVERY_GLOBAL_SIGNOUT_FAILED' }),
      }));
      const output = warn.mock.calls.flat().join(' ');
      expect(output).toContain('RECOVERY_GLOBAL_SIGNOUT_FAILED');
      expect(output).not.toContain('access-secret-token');
      expect(output).not.toContain('refresh-secret-token');
      expect(output).not.toContain('password-secret');
    } finally {
      warn.mockRestore();
      if (previousMode === undefined) delete process.env.AUTH_PROVIDER_MODE;
      else process.env.AUTH_PROVIDER_MODE = previousMode;
    }
  });

  it('Google callback emite cookie e redireciona para destino interno', async () => {
    const google = {
      callback: jest.fn().mockResolvedValue({
        kind: 'session',
        accessToken: 'a.b.c',
        user: { id: 'profile-1' },
        redirectTo: '/produtos.html',
      }),
    };
    const controller = new AuthController(
      authService,
      undefined,
      undefined,
      undefined,
      google as any,
    );
    const res = response();
    await controller.googleCallback(
      { query: { code: 'code', state: 'state' } } as any,
      res,
    );
    expect(res.code).toHaveBeenCalledWith(302);
    expect(res.header).toHaveBeenCalledWith('Location', '/produtos.html');
    expect(res.send).toHaveBeenCalledTimes(1);
    expect(res.setCookie).toHaveBeenCalledWith(
      'jwt',
      'a.b.c',
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it('Google callback com falha nunca responde vazio', async () => {
    const google = {
      callback: jest.fn().mockRejectedValue(new Error('provider failure')),
    };
    const controller = new AuthController(
      authService,
      undefined,
      undefined,
      undefined,
      google as any,
    );
    const res = response();
    await controller.googleCallback(
      { query: { code: '', state: 'state' }, requestId: 'request-1' } as any,
      res,
    );
    expect(res.code).toHaveBeenCalledWith(302);
    expect(res.header).toHaveBeenCalledWith(
      'Location',
      '/?auth_error=auth_failed',
    );
    expect(res.send).toHaveBeenCalledTimes(1);
  });
  it('Google start aguarda e redireciona exatamente uma vez para o Google', async () => {
    const google = {
      start: jest
        .fn()
        .mockResolvedValue(
          'https://accounts.google.com/o/oauth2/v2/auth?prompt=select_account',
        ),
    };
    const controller = new AuthController(
      authService,
      undefined,
      undefined,
      undefined,
      google as any,
    );
    const res = response();
    await controller.googleStart({} as any, res);
    expect(res.code).toHaveBeenCalledWith(302);
    expect(res.header).toHaveBeenCalledWith(
      'Location',
      'https://accounts.google.com/o/oauth2/v2/auth?prompt=select_account',
    );
    const location = res.header.mock.calls[0][1];
    expect(new URL(location).hostname).toBe('accounts.google.com');
    expect(new URL(location).searchParams.get('prompt')).toBe('select_account');
    expect(res.send).toHaveBeenCalledTimes(1);
  });

  it('Google callback possui rate limit separado do controller', () => {
    expect(
      Reflect.getMetadata(
        RATE_LIMIT_KEY,
        AuthController.prototype.googleCallback,
      ),
    ).toEqual({ max: 10, windowMs: 60_000 });
  });
});
