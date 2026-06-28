import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class CsrfOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return true;

    const origin = request.header('origin');
    if (!origin) return true;

    const forwardedHost = request.header('x-forwarded-host');
    const host = forwardedHost || request.header('host');
    const expectedOrigins = new Set(
      (process.env.CORS_ALLOWED_ORIGINS || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    );

    if (host) {
      expectedOrigins.add(`https://${host}`);
      if (process.env.NODE_ENV !== 'production') {
        expectedOrigins.add(`http://${host}`);
      }
    }

    if (!expectedOrigins.has(origin)) {
      throw new ForbiddenException('Origem da requisicao nao permitida.');
    }
    return true;
  }
}
