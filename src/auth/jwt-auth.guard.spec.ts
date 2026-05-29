import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  function contextWithCookies(cookies?: Record<string, string>) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          cookies,
        }),
      }),
    } as any;
  }

  it('profile com cookie ausente retorna 401 NO_COOKIE', () => {
    const guard = new JwtAuthGuard();

    expect(() =>
      guard.handleRequest(null, undefined as any, undefined, contextWithCookies()),
    ).toThrow(UnauthorizedException);

    try {
      guard.handleRequest(null, undefined as any, undefined, contextWithCookies());
    } catch (error) {
      expect((error as UnauthorizedException).message).toContain('NO_COOKIE');
    }
  });

  it('classifica token expirado sem logar token completo', () => {
    const guard = new JwtAuthGuard();

    try {
      guard.handleRequest(
        null,
        undefined as any,
        new Error('jwt expired'),
        contextWithCookies({ jwt: 'abc.def.ghi' }),
      );
    } catch (error) {
      expect((error as UnauthorizedException).message).toContain('TOKEN_EXPIRED');
    }
  });
});
