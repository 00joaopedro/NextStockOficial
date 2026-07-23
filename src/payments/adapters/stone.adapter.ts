import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PaymentProviderCode } from '@prisma/client';
import {
  PaymentProviderAdapter,
  ProviderCredentials,
  ProviderPayment,
} from '../ports/payment-provider.interface';

/** Administrative identity only. It deliberately performs no remote POS calls. */
@Injectable()
export class StoneAdapter implements PaymentProviderAdapter {
  readonly code = PaymentProviderCode.STONE;
  validateConnection(): Promise<{
    externalAccountId: string;
    capabilities: string[];
  }> {
    return Promise.reject(
      new ServiceUnavailableException(
        'Stone remota requer produto, contrato e homologacao especificos.',
      ),
    );
  }
  getPaymentStatus(): Promise<ProviderPayment> {
    return Promise.reject(
      new ServiceUnavailableException(
        'Pagamento remoto Stone nao esta disponivel.',
      ),
    );
  }
  cancelPayment(
    credentials: ProviderCredentials,
    paymentId: string,
  ): Promise<ProviderPayment> {
    void credentials;
    void paymentId;
    return Promise.reject(
      new ServiceUnavailableException(
        'Pagamento remoto Stone nao esta disponivel.',
      ),
    );
  }
}
