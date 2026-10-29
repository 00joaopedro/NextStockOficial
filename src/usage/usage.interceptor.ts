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
        const path = request.routeOptions?.url || request.route?.path;
        if (!request.user?.id || !request.tenantContext?.tenantId || !path ||
            (request.originalUrl || request.url || '').split('?')[0].endsWith('/usage/page-view')) return;
        void this.usageService.record({
          user: request.user,
          tenantId: request.tenantContext.tenantId,
          branchId: request.tenantContext.branchId,
          systemType: request.tenantContext.systemType,
          eventType: 'request',
          route: path,
          method: request.method,
          statusCode: request.res?.statusCode,
          durationMs: Date.now() - startedAt,
        });
      }),
    );
  }
}
