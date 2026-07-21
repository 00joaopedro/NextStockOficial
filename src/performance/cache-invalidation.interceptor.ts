import { CallHandler, ExecutionContext, Injectable } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { PerformanceCacheService } from './performance-cache.service';
import { getRequestHeader } from '../common/http-types';

@Injectable()
export class CacheInvalidationInterceptor {
  constructor(
    private readonly cache: PerformanceCacheService,
    private readonly tenantContext: TenantContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method))
      return next.handle();

    return next.handle().pipe(
      tap(() => {
        void this.invalidate(request);
      }),
    );
  }

  private async invalidate(request: any) {
    try {
      const existing = request.tenantContext;
      const resolved =
        existing ??
        (request.user
          ? await this.tenantContext.resolve(request.user, {
              selectedBranchId: getRequestHeader(
                request,
                'x-nextstock-branch-id',
              ),
              requireBranch: true,
              allowDevSupport:
                getRequestHeader(
                  request,
                  'x-nextstock-dev-context',
                )?.toLowerCase() === 'support',
            })
          : null);
      if (resolved?.tenantId && resolved?.branchId) {
        this.cache.invalidateTenantBranch(resolved.tenantId, resolved.branchId);
      }
    } catch {
      // TTL curto permanece como fallback; invalidacao nunca quebra a resposta.
    }
  }
}
