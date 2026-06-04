import { UnauthorizedException } from '@nestjs/common';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

describe('OptionalJwtAuthGuard', () => {
  const context = (cookies?: Record<string, string>) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ cookies }),
      }),
    }) as any;

  it('permite rota demo somente quando nao existe cookie JWT', () => {
    const guard = new OptionalJwtAuthGuard();
    expect(guard.handleRequest(null, undefined, undefined, context())).toBeUndefined();
  });

  it('nao transforma JWT invalido em usuario anonimo/demo', () => {
    const guard = new OptionalJwtAuthGuard();
    expect(() =>
      guard.handleRequest(
        null,
        undefined,
        { message: 'invalid signature' },
        context({ jwt: 'invalid.jwt.value' }),
      ),
    ).toThrow(UnauthorizedException);
  });
});
