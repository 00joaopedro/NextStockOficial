import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

type RateBucket = { count: number; resetAt: number };

@Injectable()
export class PublicRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, RateBucket>();
  private readonly windowMs = 60_000;
  private readonly maxRequests = 20;

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const forwarded = request.header('x-forwarded-for')?.split(',')[0]?.trim();
    const ip = forwarded || request.ip || request.socket.remoteAddress || 'unknown';
    const key = `${request.method}:${request.route?.path ?? request.path}:${ip}`;
    const now = Date.now();
    const current = this.buckets.get(key);

    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      this.cleanup(now);
      return true;
    }

    if (current.count >= this.maxRequests) {
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
