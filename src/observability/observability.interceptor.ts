import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { catchError, tap, throwError } from 'rxjs';
import { ObservabilityService } from './observability.service';

@Injectable()
export class ObservabilityInterceptor implements NestInterceptor {
  private readonly slowRequestThresholdMs = parseSlowRequestThreshold(
    process.env.HTTP_SLOW_REQUEST_THRESHOLD_MS,
  );

  constructor(private readonly observability: ObservabilityService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest();
    const startedAt = Date.now();
    const base = () => ({
      requestId: request.requestId,
      method: request.method,
      path: request.route?.path || request.path || request.originalUrl || request.url || 'unknown',
      actorProfileId: request.user?.id,
      tenantId: request.tenantContext?.tenantId || request.user?.tenantId,
      branchId: request.tenantContext?.branchId || request.user?.branchId,
      durationMs: Date.now() - startedAt,
    });
    const shouldLog = (durationMs: number, statusCode?: number) =>
      this.slowRequestThresholdMs <= 0 ||
      durationMs >= this.slowRequestThresholdMs ||
      (statusCode ?? 200) >= 400;
    return next.handle().pipe(
      tap(() => {
        const statusCode = request.res?.statusCode;
        const data = base();
        if (!shouldLog(data.durationMs, statusCode)) {
          return;
        }
        this.observability.log({
          level:
            this.slowRequestThresholdMs > 0 &&
            data.durationMs >= this.slowRequestThresholdMs
              ? 'warn'
              : 'info',
          eventType: 'http.request',
          outcome: 'success',
          statusCode,
          ...data,
        });
      }),
      catchError((error) => {
        const statusCode =
          typeof error?.getStatus === 'function' ? error.getStatus() : 500;
        this.observability.log({
          level: statusCode >= 500 ? 'error' : 'warn',
          eventType: 'http.request',
          outcome: 'failed',
          statusCode,
          errorCode: error?.code || error?.name || 'REQUEST_FAILED',
          ...base(),
        });
        return throwError(() => error);
      }),
    );
  }
}

function parseSlowRequestThreshold(value?: string): number {
  const parsed = Number(value ?? 0);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}
