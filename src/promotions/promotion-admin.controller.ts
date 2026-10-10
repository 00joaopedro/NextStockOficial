import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { DevSuperAdminGuard } from '../auth/dev-super-admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CsrfOriginGuard } from '../security/csrf-origin.guard';
import { PromotionsService } from './promotions.service';

@Controller('promotions/admin')
@UseGuards(JwtAuthGuard, DevSuperAdminGuard)
export class PromotionAdminController {
  constructor(private readonly promotions: PromotionsService) {}

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
    const context = await this.promotions.getPublicContext(slug);
    const campaign = await this.promotions.getAdminDashboard(context.slug);
    return campaign.reservations;
  }

  @Get(':slug/payments')
  async payments(@Param('slug') slug: string) {
    const dashboard = await this.promotions.getAdminDashboard(slug);
    return dashboard.payments;
  }

  @Post(':slug/open')
  @UseGuards(CsrfOriginGuard)
  open(@Param('slug') slug: string) {
    return this.promotions.activate(slug);
  }

  @Post(':slug/activate')
  @UseGuards(CsrfOriginGuard)
  activate(@Param('slug') slug: string) {
    return this.promotions.activate(slug, true);
  }

  @Post(':slug/close')
  @UseGuards(CsrfOriginGuard)
  close(@Param('slug') slug: string, @Body() body: { reason?: string }) {
    return this.promotions.close(slug, body?.reason || 'MANUAL');
  }
}
