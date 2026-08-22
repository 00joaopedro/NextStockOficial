import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { SystemModule } from '../system/system.module';
import { MercadoPagoAdapter } from './adapters/mercado-pago.adapter';
import { PagarmeAdapter } from './adapters/pagarme.adapter';
import { StoneAdapter } from './adapters/stone.adapter';
import { PaymentCredentialsCryptoService } from './payment-credentials-crypto.service';
import { PaymentProviderRegistry } from './payment-provider.registry';
import { PaymentWebhookController } from './payment-webhook.controller';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
@Module({
  imports: [PrismaModule, TenancyModule, SystemModule, AuditModule],
  controllers: [PaymentsController, PaymentWebhookController],
  providers: [
    MercadoPagoAdapter,
    PagarmeAdapter,
    StoneAdapter,
    PaymentCredentialsCryptoService,
    PaymentProviderRegistry,
    PaymentsService,
  ],
  exports: [PaymentProviderRegistry, PaymentsService],
})
export class PaymentsModule {}
