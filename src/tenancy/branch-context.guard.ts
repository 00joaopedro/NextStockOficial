import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import {
  TENANT_CONTEXT_OPTIONS,
  TenantContextMetadata,
} from './tenant-context.decorator';
import { TenantContextService } from './tenant-context.service';

@Injectable()
export class BranchContextGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantContext: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const options =
      this.reflector.getAllAndOverride<TenantContextMetadata>(
        TENANT_CONTEXT_OPTIONS,
        [context.getHandler(), context.getClass()],
      ) ?? {};
    const selectedBranchId = request.header('x-nextstock-branch-id');

    (request as Request & { tenantContext?: unknown }).tenantContext =
      await this.tenantContext.resolve(request.user, {
        ...options,
        selectedBranchId,
      });

    return true;
  }
}
