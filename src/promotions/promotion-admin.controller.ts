import {
  AuditOutcome,
  AuditSeverity,
} from '@prisma/client';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from '../common/http-types';
import { DevSuperAdminGuard } from '../auth/dev-super-admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CsrfOriginGuard } from '../security/csrf-origin.guard';
import { AuditService } from '../audit/audit.service';
import { PromotionsService } from './promotions.service';

@Controller('promotions/admin')
@UseGuards(JwtAuthGuard, DevSuperAdminGuard)
export class PromotionAdminController {
  constructor(
    private readonly promotions: PromotionsService,
    private readonly audit: AuditService,
  ) {}

  @Get(':slug/dashboard')
  dashboard(@Param('slug') slug: string) {
    return this.promotions.getAdminDashboard(slug);
  }

  @Get(':slug/configuration')
  configuration() {
    return this.promotions.getProductionConfiguration();
  }

  @Get(':slug/reservations')
  async reservations(@Param('slug') slug: string) {
    const dashboard = await this.promotions.getAdminDashboard(slug);
    return dashboard.reservations;
  }

  @Get(':slug/payments')
  async payments(@Param('slug') slug: string) {
    const dashboard = await this.promotions.getAdminDashboard(slug);
    return dashboard.payments;
  }

  @Post(':slug/open')
  @UseGuards(CsrfOriginGuard)
  async open(@Req() request: Request, @Param('slug') slug: string) {
    const campaign = await this.promotions.activate(slug, true);
    await this.recordTransition(request, campaign, 'OPEN', 'SUPERADMIN_OPEN');
    return campaign;
  }

  @Post(':slug/activate')
  @UseGuards(CsrfOriginGuard)
  async activate(@Req() request: Request, @Param('slug') slug: string) {
    const campaign = await this.promotions.activate(slug, true);
    await this.recordTransition(request, campaign, 'ACTIVATE', 'PRODUCTION_READY');
    return campaign;
  }

  @Post(':slug/close')
  @UseGuards(CsrfOriginGuard)
  async close(
    @Req() request: Request,
    @Param('slug') slug: string,
    @Body() body: { reason?: string },
  ) {
    const reason = body?.reason || 'MANUAL';
    const campaign = await this.promotions.close(slug, reason);
    await this.recordTransition(request, campaign, 'CLOSE', reason);
    return campaign;
  }

  private async recordTransition(
    request: Request,
    campaign: { id: string; slug: string; status: string; closeReason?: string | null },
    action: string,
    reasonCode: string,
  ) {
    await this.audit.recordBestEffort({
      ...this.audit.fromRequest(request),
      eventType: 'promotion.campaign.transition',
      severity: AuditSeverity.HIGH,
      action: `PROMOTION_CAMPAIGN_${action}`,
      outcome: AuditOutcome.SUCCESS,
      targetType: 'promotion_campaign',
      targetId: campaign.id,
      reasonCode,
      metadata: {
        campaignSlug: campaign.slug,
        status: campaign.status,
        closeReason: campaign.closeReason ?? null,
      },
      afterState: {
        status: campaign.status,
        slug: campaign.slug,
      },
    });
  }
}
