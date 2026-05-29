import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  handleRequest<TUser = Express.AuthenticatedUser>(
    err: Error | null,
    user: TUser,
    info?: Error,
  ): TUser {
    if (err || !user) {
      const reason = err?.message || info?.message || 'missing authenticated user';
      this.logger.warn(`JWT validation failed: ${reason}`);
      throw err || new UnauthorizedException('Sessao expirada ou invalida. Faca login novamente.');
    }

    return user;
  }
}
