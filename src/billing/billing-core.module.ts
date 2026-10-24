import { Module } from '@nestjs/common';
import { RailwayMetricsModule } from '../dev/railway-metrics.module';
import { RenderMetricsModule } from '../dev/render-metrics.module';
import { BillingEntitlementService } from './billing-entitlement.service';
import { BillingEventsService } from './billing-events.service';
import { CheckoutService } from './checkout.service';
import { MercadoPagoGatewayAdapter } from './gateways/mercado-pago/mercado-pago.adapter';
import { MercadoPagoSignatureService } from './gateways/mercado-pago/mercado-pago-signature.service';
import { PaymentGatewayRegistry } from './gateways/payment-gateway.registry';
import { PaymentsService } from './payments.service';
import { PlansService } from './plans.service';
import { ReconciliationService } from './reconciliation.service';
import { SubscriptionsService } from './subscriptions.service';
import { ServerUsageService } from './server-usage.service';
import { WebhookService } from './webhook.service';

@Module({
  imports: [RailwayMetricsModule, RenderMetricsModule],
  providers: [
    BillingEntitlementService,
    BillingEventsService,
    CheckoutService,
    MercadoPagoGatewayAdapter,
    MercadoPagoSignatureService,
    PaymentGatewayRegistry,
    PaymentsService,
    PlansService,
    ReconciliationService,
    SubscriptionsService,
    ServerUsageService,
    WebhookService,
  ],
  exports: [
    BillingEntitlementService,
    BillingEventsService,
    CheckoutService,
    PaymentsService,
    PlansService,
    ReconciliationService,
    SubscriptionsService,
    ServerUsageService,
    WebhookService,
  ],
})
export class BillingCoreModule {}
