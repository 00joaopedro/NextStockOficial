import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from '../common/http-types';
import { DevSuperAdminGuard } from '../auth/dev-super-admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { canAccessDev } from '../auth/super-admin.util';
import { DevService } from './dev.service';
import { DevQueryDto } from './dto/dev-query.dto';
import { DevUsageQueryDto } from './dto/dev-usage-query.dto';
import { DevWorkspaceService } from '../tenancy/dev-workspace.service';

@Controller('dev')
@UseGuards(JwtAuthGuard, DevSuperAdminGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class DevController {
  constructor(
    private readonly devService: DevService,
    private readonly devWorkspaces: DevWorkspaceService,
  ) {}

  @Get('overview')
  getOverview(@Req() request: Request, @Query() query: DevQueryDto) {
    this.assertDevSuperAdmin(request.user);
    return this.devService.getOverview(query.period || 'today');
  }

  @Get('users-usage')
  getUsersUsage(@Req() request: Request, @Query() query: DevUsageQueryDto) {
    this.assertDevSuperAdmin(request.user);
    return this.devService.getUsersUsage(query);
  }

  @Get('health')
  async getHealth(@Req() request: Request) {
    this.assertDevSuperAdmin(request.user);
    await this.devWorkspaces.ensureDefaultWorkspaces(request.user!.id);
    return this.devService.getHealth();
  }

  @Get('workspaces')
  async getWorkspaces(@Req() request: Request) {
    this.assertDevSuperAdmin(request.user);
    await this.devWorkspaces.ensureDefaultWorkspaces(request.user!.id);
    const workspaces = await this.devWorkspaces.listDefaultWorkspaces(
      request.user!.id,
    );

    return {
      ok: true,
      workspaces: workspaces.map((workspace: any) => ({
        systemType: workspace.systemType,
        selectedBranch: {
          id: workspace.branch.id,
          name: workspace.branch.name,
          slug: workspace.branch.slug,
          tenantId: workspace.tenantId,
          systemType: workspace.systemType,
          isDevWorkspace: true,
        },
        tenant: workspace.tenant,
      })),
    };
  }

  @Get('support/branches')
  async getSupportBranches(@Req() request: Request, @Query('systemType') systemType?: string) {
    this.assertDevSuperAdmin(request.user);

    return {
      ok: true,
      branches: await this.devWorkspaces.listSupportBranches(
        request.user!,
        systemType,
      ),
    };
  }

  private assertDevSuperAdmin(user: AuthenticatedUser | undefined) {
    if (!canAccessDev(user)) {
      throw new ForbiddenException('Acesso restrito ao Dev SuperAdmin.');
    }
  }
}
