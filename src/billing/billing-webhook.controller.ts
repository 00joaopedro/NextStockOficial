import { Body, Controller, Headers, Post, Query, Req } from '@nestjs/common';
import type { Request } from '../common/http-types';
import { BillingExempt } from './billing-exempt.decorator';
import { WebhookService } from './webhook.service';
import { CsrfExempt } from '../security/csrf-origin.guard';
import { PublicRateLimitGuard, RateLimit } from '../security/public-rate-limit.guard';
import { UseGuards } from '@nestjs/common';

@Controller('billing/webhooks')
@BillingExempt()
export class BillingWebhookController {
  constructor(private readonly webhooks: WebhookService) {}

  @Post('mercado-pago')
  @CsrfExempt()
  @UseGuards(PublicRateLimitGuard)
  @RateLimit({ max: 120, windowMs: 60_000 })
  mercadoPago(
    @Req() req: Request,
    @Body() body: Record<string, unknown>,
    @Query() query: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.webhooks.handleMercadoPago({ headers, query, body });
  }
}
