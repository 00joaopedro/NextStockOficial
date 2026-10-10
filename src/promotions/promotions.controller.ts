import {
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from '../common/http-types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CsrfOriginGuard } from '../security/csrf-origin.guard';
import {
  PublicRateLimitGuard,
  RateLimit,
} from '../security/public-rate-limit.guard';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { PromotionsService } from './promotions.service';

@Controller('promotions')
export class PromotionsController {
  constructor(
    private readonly promotions: PromotionsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get(':slug/context')
  @UseGuards(PublicRateLimitGuard)
  @RateLimit({ max: 30, windowMs: 60_000 })
  context(@Param('slug') slug: string) {
    return this.promotions.getPublicContext(slug);
  }

  @Post(':slug/reservation')
  @UseGuards(JwtAuthGuard, CsrfOriginGuard)
  reserve(
    @Req() req: Request,
    @Param('slug') slug: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.tenantContext.resolve(req.user).then((context) =>
      this.promotions.reserveForTenant({
        slug,
        tenantId: context.tenantId,
        idempotencyKey,
      }),
    );
  }
}
