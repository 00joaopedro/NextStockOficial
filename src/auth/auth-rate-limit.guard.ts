import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isIP } from 'net';
import type { Request } from '../common/http-types';
import { ObservabilityService } from '../observability/observability.service';
import {
  RATE_LIMIT_KEY,
  RateLimitOptions,
} from '../security/public-rate-limit.guard';
import { AuthRateLimitStore } from './auth-rate-limit.store';

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly store: AuthRateLimitStore,
    private readonly observability: ObservabilityService,
  ) {}

  async canActivate(context: ExecutionContext) {
    if (process.env.AUTH_RATE_LIMIT_ENABLED === 'false') return true;
    const request = context.switchToHttp().getRequest<Request>();
    const response = context
      .switchToHttp()
      .getResponse<{ header(name: string, value: string): void }>();
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!options) return true;
    const action = `${request.method}:${request.route?.path ?? request.path}`;
    const account =
      options.includeEmail && typeof request.body?.email === 'string'
        ? request.body.email.trim().toLowerCase()
        : undefined;
    const ip = normalizeIp(
      request.ip || request.socket?.remoteAddress || 'unknown',
    );
    const started = Date.now();
    try {
      const result = await this.store.consume({
        action,
        ip,
        account,
        max: options.max,
        windowMs: options.windowMs,
      });
      // Bounded, non-blocking opportunistic retention; correctness never depends on it.
      if (Math.floor(Math.random() * 1_024) === 0) {
        void this.store.cleanupExpired().catch(() => undefined);
      }
      this.observability.log({
        event: 'auth_rate_limit',
        outcome: result.allowed ? 'allowed' : 'blocked',
        action,
        blockedIdentityType: result.blockedBy,
        store: 'postgres',
        storeLatencyMs: Date.now() - started,
      });
      if (!result.allowed) {
        response.header('Retry-After', String(result.retryAfterSeconds));
        throw new HttpException(
          'Muitas tentativas. Aguarde e tente novamente.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return true;
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 429)
        throw error;
      this.observability.log({
        event: 'auth_rate_limit_store_failure',
        action,
        store: 'postgres',
        storeLatencyMs: Date.now() - started,
      });
      throw new ServiceUnavailableException(
        'Servico de autenticacao temporariamente indisponivel.',
      );
    }
  }
}

export function normalizeIp(input: string): string {
  const value = input
    .trim()
    .replace(/^\[|\]$/g, '')
    .split('%', 1)[0];
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(value);
  if (mapped && isIP(mapped[1]) === 4) return mapped[1];
  if (isIP(value) === 4) return value.split('.').map(Number).join('.');
  if (isIP(value) !== 6) return 'unknown';
  return expandIpv6(value)
    .map((part) => part.toString(16))
    .join(':');
}

function expandIpv6(value: string): number[] {
  const [leftRaw, rightRaw = ''] = value.toLowerCase().split('::');
  const parse = (side: string) =>
    side ? side.split(':').map((part) => parseInt(part, 16)) : [];
  const left = parse(leftRaw);
  const right = parse(rightRaw);
  const zeros = new Array<number>(8 - left.length - right.length).fill(0);
  return value.includes('::') ? [...left, ...zeros, ...right] : left;
}
