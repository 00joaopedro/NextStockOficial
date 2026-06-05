import {
  Body,
  Controller,
  Headers,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { RecordUsageEventDto } from './dto/record-usage-event.dto';
import { UsageService } from './usage.service';

@Controller('usage')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class UsageController {
  constructor(
    private readonly usageService: UsageService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Post('page-view')
  @UseGuards(JwtAuthGuard)
  async recordPageView(
    @Req() request: Request,
    @Body() body: RecordUsageEventDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    const context = await this.tenantContext.resolve(request.user, {
      selectedBranchId,
      requireBranch: Boolean(selectedBranchId || request.user?.branchId),
      allowDevSupport: devContextMode?.toLowerCase() === 'support',
    });

    await this.usageService.record({
      user: request.user,
      tenantId: context.tenantId,
      branchId: context.branchId,
      systemType: context.systemType,
      eventType: body.eventType || 'page_view',
      page: body.page,
      route: request.originalUrl || request.url,
      method: request.method,
      weight: 1,
      metadata: {
        contextKind: context.contextKind,
      },
    });

    return { ok: true };
  }
}
