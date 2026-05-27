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
});
