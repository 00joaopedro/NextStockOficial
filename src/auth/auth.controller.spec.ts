import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const authService = {
    login: jest.fn(),
    register: jest.fn(),
  } as any;
  const response = () =>
    ({
      cookie: jest.fn(),
      clearCookie: jest.fn(),
      setHeader: jest.fn(),
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

    await controller.login({ email: 'user@test.com', password: 'Senha123' }, res);

    expect(res.cookie).toHaveBeenCalledWith(
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

    expect(res.cookie).toHaveBeenCalledWith(
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
    expect(res.cookie).toHaveBeenCalledWith(
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
});
