import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = Express.AuthenticatedUser | undefined>(
    _err: unknown,
    user: TUser,
  ): TUser | undefined {
    return user ?? undefined;
  }

  async canActivate(context: ExecutionContext) {
    try {
      return (await super.canActivate(context)) as boolean;
    } catch {
      const request = context.switchToHttp().getRequest();
      request.user = undefined;
      return true;
    }
  }
}
