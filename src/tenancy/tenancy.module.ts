import { Global, Module } from '@nestjs/common';
import { BranchContextGuard } from './branch-context.guard';
import { DevWorkspaceService } from './dev-workspace.service';
import { TenantAccessService } from './tenant-access.service';
import { TenantContextService } from './tenant-context.service';

@Global()
@Module({
  providers: [
    TenantAccessService,
    TenantContextService,
    BranchContextGuard,
    DevWorkspaceService,
  ],
  exports: [
    TenantAccessService,
    TenantContextService,
    BranchContextGuard,
    DevWorkspaceService,
  ],
})
export class TenancyModule {}
