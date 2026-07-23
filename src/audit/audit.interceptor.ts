import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { AuditOutcome, AuditSeverity } from '@prisma/client';
import { catchError, tap, throwError } from 'rxjs';
import { AuditService } from './audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest();
    const method = String(request.method || 'GET').toUpperCase();
    const path = String(
      request.originalUrl || request.path || request.url || '',
    );
    const shouldRecord =
      !['GET', 'HEAD', 'OPTIONS'].includes(method) ||
      /\/(?:download|xml|pdf|support\/branches)(?:\/|$)/i.test(path);
    const eventType = this.eventType(method, path);

    return next.handle().pipe(
      tap(() => {
        if (!shouldRecord) return;
        void this.audit.record({
          ...this.audit.fromRequest(request),
          eventType: `${eventType}.success`,
          action: `${method} ${request.route?.path || request.path || request.url || 'unknown'}`,
          outcome: AuditOutcome.SUCCESS,
          severity: AuditSeverity.LOW,
          targetType: request.route?.path ? 'http_route' : null,
          targetId: request.params?.id || request.params?.userId || null,
          metadata: { statusCode: request.res?.statusCode },
        });
      }),
      catchError((error) => {
        if (shouldRecord || error instanceof HttpException) {
          const status =
            error instanceof HttpException ? error.getStatus() : 500;
          void this.audit.record({
            ...this.audit.fromRequest(request),
            eventType:
              status === 403 ? 'authorization.denied' : `${eventType}.failed`,
            action: `${method} ${request.route?.path || request.path || request.url || 'unknown'}`,
            outcome:
              status === 401 || status === 403
                ? AuditOutcome.DENIED
                : AuditOutcome.FAILED,
            severity: status >= 500 ? AuditSeverity.HIGH : AuditSeverity.MEDIUM,
            reasonCode: `HTTP_${status}`,
            targetId: request.params?.id || request.params?.userId || null,
          });
        }
        return throwError(() => error);
      }),
    );
  }

  private eventType(method: string, path: string) {
    if (/\/billing\/webhooks/i.test(path)) return 'billing.webhook';
    if (/\/billing\/sync/i.test(path)) return 'billing.reconciliation';
    if (/\/billing\/checkout/i.test(path)) return 'billing.checkout';
    if (/\/fiscal/i.test(path)) return 'fiscal.operation';
    if (/\/employees/i.test(path)) return 'employee.mutation';
    if (/\/users/i.test(path) && /role/i.test(path)) return 'user.role_change';
    if (/\/users/i.test(path)) return 'user.mutation';
    if (/\/partners/i.test(path)) return 'partner.mutation';
    if (/\/(?:images|photos|files)\/upload/i.test(path))
      return 'storage.upload';
    if (/\/(?:download|xml|pdf)(?:\/|$)/i.test(path))
      return 'storage.private_read';
    return `http.${method.toLowerCase()}`;
  }
}
