import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { UsageService } from './usage.service';

@Injectable()
export class UsageInterceptor implements NestInterceptor {
  constructor(private readonly usageService: UsageService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap(() => {
        void this.usageService.record({
          user: request.user,
          eventType: 'request',
          route: request.originalUrl || request.url,
          method: request.method,
          statusCode: request.res?.statusCode,
          durationMs: Date.now() - startedAt,
        });
      }),
    );
  }
}
