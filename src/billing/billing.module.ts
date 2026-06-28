import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PublicRateLimitGuard } from '../security/public-rate-limit.guard';
import { CsrfOriginGuard } from '../security/csrf-origin.guard';
import { BillingWebhookController } from './billing-webhook.controller';
import { BillingController } from './billing.controller';
import { BillingCoreModule } from './billing-core.module';

@Module({
  imports: [AuthModule, BillingCoreModule],
  controllers: [BillingController, BillingWebhookController],
  providers: [PublicRateLimitGuard, CsrfOriginGuard],
  exports: [BillingCoreModule],
})
export class BillingModule {}
