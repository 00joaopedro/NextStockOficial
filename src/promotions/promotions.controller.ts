import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from '../common/http-types';
import { BillingExempt } from '../billing/billing-exempt.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CsrfOriginGuard } from '../security/csrf-origin.guard';
import {
  PublicRateLimitGuard,
  RateLimit,
} from '../security/public-rate-limit.guard';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { PromotionsService } from './promotions.service';
import { ReservePromotionDto } from './dto/reserve-promotion.dto';

@Controller('promotions')
export class PromotionsController {
  constructor(
    private readonly promotions: PromotionsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get(':slug/context')
  @Header('Cache-Control', 'no-store')
  @UseGuards(PublicRateLimitGuard)
  @RateLimit({ max: 30, windowMs: 60_000 })
  context(@Param('slug') slug: string) {
    return this.promotions.getPublicContext(slug);
  }

  @Get(':slug/reservation')
  @Header('Cache-Control', 'private, no-store')
  @BillingExempt()
  @UseGuards(JwtAuthGuard)
  async reservation(
    @Req() req: Request,
    @Param('slug') slug: string,
    @Headers('x-nextstock-branch-id') branchId?: string,
    @Headers('x-nextstock-dev-context') devContext?: string,
  ) {
    const context = await this.tenantContext.resolve(req.user, {
      selectedBranchId: branchId,
      allowDevSupport: devContext?.toLowerCase() === 'support',
    });
    return this.promotions.getReservationForTenant(slug, context.tenantId, context.role === Role.Admin);
  }

  @Post(':slug/reservation')
  @UseGuards(JwtAuthGuard, CsrfOriginGuard)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  reserve(
    @Req() req: Request,
    @Param('slug') slug: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: ReservePromotionDto,
  ) {
    return this.tenantContext.resolve(req.user).then((context) =>
      this.promotions.reserveForTenant({
        slug,
        tenantId: context.tenantId,
        idempotencyKey,
        planSlug: body.planSlug,
        periodMonths: body.periodMonths,
      }),
    );
  }
}
