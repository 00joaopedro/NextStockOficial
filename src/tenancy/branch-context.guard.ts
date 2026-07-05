import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
} from '@nestjs/common';
import { AuditOutcome, AuditSeverity } from '@prisma/client';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import {
  TENANT_CONTEXT_OPTIONS,
  TenantContextMetadata,
} from './tenant-context.decorator';
import { TenantContextService } from './tenant-context.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class BranchContextGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantContext: TenantContextService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const options =
      this.reflector.getAllAndOverride<TenantContextMetadata>(
        TENANT_CONTEXT_OPTIONS,
        [context.getHandler(), context.getClass()],
      ) ?? {};
    const selectedBranchId = request.header('x-nextstock-branch-id');
    const devContextMode = request.header('x-nextstock-dev-context');

    const resolved = await this.tenantContext.resolve(request.user, {
      ...options,
      selectedBranchId,
      allowDevSupport:
        options.allowDevSupport || devContextMode?.toLowerCase() === 'support',
    });
    (request as Request & { tenantContext?: unknown }).tenantContext = resolved;

    if (resolved.contextKind === 'dev-support') {
      await this.audit?.record({
        ...this.audit.fromRequest(request),
        eventType: 'dev_support.tenant_access',
        action: 'access_real_tenant',
        outcome: AuditOutcome.SUCCESS,
        severity: AuditSeverity.HIGH,
        tenantId: resolved.tenantId,
        branchId: resolved.branchId,
        metadata: { method: request.method, path: request.path },
      });
    }

    return true;
  }
}
