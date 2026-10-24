import { AuditOutcome, AuditSeverity } from '@prisma/client';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from '../common/http-types';
import { DevSuperAdminGuard } from '../auth/dev-super-admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CsrfOriginGuard } from '../security/csrf-origin.guard';
import { BillingExempt } from '../billing/billing-exempt.decorator';
import { AuditService } from '../audit/audit.service';
import { UpdatePromotionCapacityDto } from './dto/update-promotion-capacity.dto';
import { PromotionsService } from './promotions.service';

@Controller('promotions/admin')
@BillingExempt()
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
  async configuration() {
    return this.promotions.getProductionConfiguration();
  }

  @Get(':slug/reservations')
  reservations(@Param('slug') slug: string) {
    return this.promotions.getAdminReservations(slug);
  }

  @Get(':slug/payments')
  payments(@Param('slug') slug: string) {
    return this.promotions.getAdminPayments(slug);
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
    await this.recordTransition(
      request,
      campaign,
      'ACTIVATE',
      'PRODUCTION_READY',
    );
    return campaign;
  }

  @Post(':slug/close')
  @UseGuards(CsrfOriginGuard)
  async close(
    @Req() request: Request,
    @Param('slug') slug: string,
    @Body() body: { reason?: string; confirmation?: string },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (body?.confirmation !== 'ENCERRAR PROMOÇÃO') {
      throw new BadRequestException('Digite ENCERRAR PROMOÇÃO para confirmar.');
    }
    const reason = body?.reason || 'MANUAL';
    const audit = this.audit.fromRequest(request);
    const result = await this.promotions.close(slug, reason, idempotencyKey, {
      ...audit,
      ipHash: undefined,
      userAgentHash: undefined,
    });
    return result.campaign;
  }

  @Post(':slug/capacity')
  @UseGuards(CsrfOriginGuard)
  async updateCapacity(
    @Req() request: Request,
    @Param('slug') slug: string,
    @Body() body: UpdatePromotionCapacityDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (body.confirmation !== 'ATUALIZAR VAGAS') {
      throw new BadRequestException('Digite ATUALIZAR VAGAS para confirmar.');
    }
    const audit = this.audit.fromRequest(request);
    const result = await this.promotions.updateCapacity(
      slug,
      body.maxConversions,
      idempotencyKey,
      {
        ...audit,
        ipHash: undefined,
        userAgentHash: undefined,
      },
    );
    return result.campaign;
  }

  private async recordTransition(
    request: Request,
    campaign: {
      id: string;
      slug: string;
      status: string;
      closeReason?: string | null;
    },
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
