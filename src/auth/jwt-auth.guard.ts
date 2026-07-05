import {
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { clearAuthCookies } from '../sessions/session-cookie';

function cleanReason(value?: string | null) {
  return value?.replace(/[\r\n]/g, ' ').slice(0, 220) || 'none';
}

function classifyAuthFailure(
  err: Error | null,
  info?: Error,
  hasJwtCookie = false,
) {
  const reason = `${err?.message ?? ''} ${info?.message ?? ''}`.toLowerCase();

  if (!hasJwtCookie) return 'NO_COOKIE';
  if (reason.includes('expired')) return 'TOKEN_EXPIRED';
  if (reason.includes('invalid signature')) return 'INVALID_SIGNATURE';
  if (
    reason.includes('invalid algorithm') ||
    reason.includes('invalid_alg') ||
    reason.includes('invalid algorithm')
  ) {
    return 'INVALID_ALGORITHM';
  }
  if (
    reason.includes('unsupported jwt alg') ||
    reason.includes('invalid_algorithm')
  ) {
    return 'INVALID_ALGORITHM';
  }
  if (reason.includes('payload_invalid') || reason.includes('missing sub')) {
    return 'PAYLOAD_INVALID';
  }
  if (
    reason.includes('profile_not_found') ||
    reason.includes('profile not found')
  ) {
    return 'PROFILE_NOT_FOUND';
  }
  if (
    reason.includes('tenant_not_linked') ||
    reason.includes('not linked to a tenant')
  ) {
    return 'TENANT_NOT_LINKED';
  }
  if (
    reason.includes('session_revoked') ||
    reason.includes('session_required')
  ) {
    return 'SESSION_REVOKED';
  }

  return 'AUTH_INVALID';
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  handleRequest<TUser = Express.AuthenticatedUser>(
    err: Error | null,
    user: TUser,
    info?: Error,
    context?: ExecutionContext,
  ): TUser {
    if (err || !user) {
      const httpContext = context?.switchToHttp();
      const request = httpContext?.getRequest();
      const response =
        typeof httpContext?.getResponse === 'function'
          ? httpContext.getResponse()
          : undefined;
      const hasCookies = Boolean(request?.cookies);
      const tokenLength =
        typeof request?.cookies?.jwt === 'string'
          ? request.cookies.jwt.length
          : 0;
      const hasJwtCookie = tokenLength > 0;
      const code = classifyAuthFailure(err, info, hasJwtCookie);
      if (code === 'SESSION_REVOKED' && response) {
        clearAuthCookies(response);
      }

      if (
        process.env.NODE_ENV !== 'production' ||
        process.env.JWT_DIAGNOSTIC_LOGS === 'true'
      ) {
        this.logger.warn(
          [
            `JWT validation failed code=${code}`,
            `hasCookies=${hasCookies}`,
            `hasJwtCookie=${hasJwtCookie}`,
            `tokenLength=${tokenLength}`,
            `info=${cleanReason(info?.message)}`,
            `err=${cleanReason(err?.message)}`,
          ].join(' '),
        );
      }

      if (err instanceof UnauthorizedException) {
        throw err;
      }

      throw new UnauthorizedException(
        `${code}: Sessao expirada ou invalida. Faca login novamente.`,
      );
    }

    return user;
  }
}
