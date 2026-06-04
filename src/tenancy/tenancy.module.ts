import { Global, Module } from '@nestjs/common';
import { BranchContextGuard } from './branch-context.guard';
import { TenantAccessService } from './tenant-access.service';
import { TenantContextService } from './tenant-context.service';

@Global()
@Module({
  providers: [TenantAccessService, TenantContextService, BranchContextGuard],
  exports: [TenantAccessService, TenantContextService, BranchContextGuard],
})
export class TenancyModule {}
