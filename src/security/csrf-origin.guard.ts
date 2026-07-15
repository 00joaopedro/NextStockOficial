import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import { Reflector } from '@nestjs/core';
import { getHeader } from '../common/http-adapter.util';

export const CSRF_EXEMPT_KEY = 'nextstock:csrf-exempt';
export const CsrfExempt = () => SetMetadata(CSRF_EXEMPT_KEY, true);

@Injectable()
export class CsrfOriginGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(CSRF_EXEMPT_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request>();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method))
      return true;
    if (!request.cookies?.jwt) return true;

    const origin =
      getHeader(request, 'origin') || this.originFromReferer(request);
    const expectedOrigins = new Set(
      `${process.env.CORS_ALLOWED_ORIGINS || ''},${process.env.PUBLIC_APP_URL || ''}`
        .split(',')
        .map((item) => item.trim().replace(/\/$/, ''))
        .filter(Boolean),
    );
    if (process.env.NODE_ENV !== 'production') {
      expectedOrigins.add('http://localhost:3000');
      expectedOrigins.add('http://127.0.0.1:3000');
    }

    if (!origin || !expectedOrigins.has(origin.replace(/\/$/, ''))) {
      throw new ForbiddenException('Origem da requisicao nao permitida.');
    }
    return true;
  }

  private originFromReferer(request: Request) {
    const referer = getHeader(request, 'referer');
    if (!referer) return undefined;
    try {
      return new URL(referer).origin;
    } catch {
      return undefined;
    }
  }
}
