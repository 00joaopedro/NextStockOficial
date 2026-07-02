import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';

type RateBucket = { count: number; resetAt: number };
type RateLimitOptions = {
  max: number;
  windowMs: number;
  includeEmail?: boolean;
};
export const RATE_LIMIT_KEY = 'nextstock:rate-limit';
export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);

@Injectable()
export class PublicRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, RateBucket>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const options =
      this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? { max: 20, windowMs: 60_000 };
    const ip = request.ip || request.socket.remoteAddress || 'unknown';
    const email =
      options.includeEmail && typeof request.body?.email === 'string'
        ? request.body.email.trim().toLowerCase()
        : '';
    const subject = createHash('sha256').update(`${ip}|${email}`).digest('hex');
    const key = `${request.method}:${request.route?.path ?? request.path}:${subject}`;
    const now = Date.now();
    const current = this.buckets.get(key);

    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      this.cleanup(now);
      return true;
    }

    if (current.count >= options.max) {
      throw new HttpException(
        'Muitas tentativas. Aguarde um minuto e tente novamente.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    current.count += 1;
    return true;
  }

  private cleanup(now: number) {
    if (this.buckets.size < 2_000) return;

    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}
