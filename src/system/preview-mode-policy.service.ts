import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { SystemMode } from '@prisma/client';
import type { Request } from 'express';
import { canAccessDev } from '../auth/super-admin.util';
import {
  TenantContext,
  TenantContextService,
} from '../tenancy/tenant-context.service';
import {
  PREVIEW_MODE_MUTATION_BLOCKED,
  PREVIEW_MODE_MUTATION_MESSAGE,
  SAFE_PREVIEW_METHODS,
} from './preview-mode.constants';

type RequestWithTenantContext = Request & {
  tenantContext?: TenantContext;
};

@Injectable()
export class PreviewModePolicyService {
  constructor(private readonly tenantContext: TenantContextService) {}

  async assertMutationAllowed(request: RequestWithTenantContext) {
    if (
      SAFE_PREVIEW_METHODS.has(request.method.toUpperCase()) ||
      !request.user
    ) {
      return;
    }

    const selectedBranchId = request.header('x-nextstock-branch-id');
    const devContextMode = request.header('x-nextstock-dev-context');
    let context = request.tenantContext;

    if (!context) {
      if (
        canAccessDev(request.user) &&
        !selectedBranchId &&
        !request.user.branchId
      ) {
        if (request.user.mode === SystemMode.visualizacao) {
          this.throwBlocked();
        }
        throw new BadRequestException(
          'Dev SuperAdmin deve selecionar um workspace ou contexto de suporte para alterar dados.',
        );
      }

      context = await this.tenantContext.resolve(request.user, {
        selectedBranchId,
        requireBranch: Boolean(selectedBranchId || request.user.branchId),
        allowDevSupport: devContextMode?.toLowerCase() === 'support',
      });
      request.tenantContext = context;
    }

    if (context.mode === SystemMode.visualizacao) {
      this.throwBlocked();
    }
  }

  private throwBlocked(): never {
    throw new ForbiddenException({
      code: PREVIEW_MODE_MUTATION_BLOCKED,
      message: PREVIEW_MODE_MUTATION_MESSAGE,
    });
  }
}
