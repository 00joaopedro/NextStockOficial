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
  constructor(private readonly observability: ObservabilityService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest();
    const startedAt = Date.now();
    const base = () => ({
      requestId: request.requestId,
      method: request.method,
      path: request.route?.path || request.path,
      actorProfileId: request.user?.id,
      tenantId: request.tenantContext?.tenantId || request.user?.tenantId,
      branchId: request.tenantContext?.branchId || request.user?.branchId,
      durationMs: Date.now() - startedAt,
    });
    return next.handle().pipe(
      tap(() =>
        this.observability.log({
          level: 'info',
          eventType: 'http.request',
          outcome: 'success',
          statusCode: request.res?.statusCode,
          ...base(),
        }),
      ),
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
