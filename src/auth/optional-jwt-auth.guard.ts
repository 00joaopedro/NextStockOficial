import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = AuthenticatedUser | undefined>(
    err: unknown,
    user: TUser,
    info?: { message?: string },
    context?: ExecutionContext,
  ): TUser | undefined {
    const request = context?.switchToHttp().getRequest();
    if (err) {
      throw err;
    }
    if (!user && request?.cookies?.jwt) {
      throw new UnauthorizedException(info?.message || 'Sessao invalida.');
    }
    return user ?? undefined;
  }

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    if (!request?.cookies?.jwt) {
      request.user = undefined;
      return true;
    }

    return (await super.canActivate(context)) as boolean;
  }
}
