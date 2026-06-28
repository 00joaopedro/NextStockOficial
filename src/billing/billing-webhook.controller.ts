import { Body, Controller, Headers, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { BillingExempt } from './billing-exempt.decorator';
import { WebhookService } from './webhook.service';

@Controller('billing/webhooks')
@BillingExempt()
export class BillingWebhookController {
  constructor(private readonly webhooks: WebhookService) {}

  @Post('mercado-pago')
  mercadoPago(
    @Req() req: Request,
    @Body() body: Record<string, unknown>,
    @Query() query: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.webhooks.handleMercadoPago({ headers, query, body });
  }
}
