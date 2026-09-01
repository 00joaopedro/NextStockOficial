import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const authService = {
    login: jest.fn(),
    register: jest.fn(),
    forgotPassword: jest.fn(),
  } as any;
  const response = () =>
    ({
      setCookie: jest.fn(),
      clearCookie: jest.fn(),
      header: jest.fn(),
    }) as any;

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
    const previousMode = process.env.AUTH_PROVIDER_MODE;
    const previousLocal = process.env.LOCAL_PASSWORD_RECOVERY_ENABLED;
    process.env.AUTH_PROVIDER_MODE = 'coexistence';
    process.env.LOCAL_PASSWORD_RECOVERY_ENABLED = 'false';
    const lifecycle = { request: jest.fn() } as any;
    const audit = { fromRequest: jest.fn().mockReturnValue({}), record: jest.fn() } as any;
    authService.forgotPassword.mockResolvedValue({ ok: true });
    try {
      await new AuthController(authService, audit, undefined, lifecycle).forgotPassword(
        { email: 'USER@Test.com' } as any,
        {} as any,
      );
      expect(authService.forgotPassword).toHaveBeenCalledTimes(1);
      expect(lifecycle.request).not.toHaveBeenCalled();
    } finally {
      process.env.AUTH_PROVIDER_MODE = previousMode;
      process.env.LOCAL_PASSWORD_RECOVERY_ENABLED = previousLocal;
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
    const lifecycle = { request: jest.fn().mockResolvedValue({ ok: true }) } as any;
    const audit = { fromRequest: jest.fn().mockReturnValue({}), record: jest.fn() } as any;
    try {
      await new AuthController(authService, audit, undefined, lifecycle).forgotPassword(
        { email: 'USER@Test.com' } as any,
        {} as any,
      );
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
});
