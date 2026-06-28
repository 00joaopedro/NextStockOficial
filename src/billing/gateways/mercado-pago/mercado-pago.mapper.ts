import { BillingPaymentStatus } from '@prisma/client';

export function mapMercadoPagoPaymentStatus(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === 'approved') return BillingPaymentStatus.APPROVED;
  if (normalized === 'rejected') return BillingPaymentStatus.REJECTED;
  if (normalized === 'cancelled' || normalized === 'canceled') {
    return BillingPaymentStatus.CANCELED;
  }
  if (normalized === 'refunded') return BillingPaymentStatus.REFUNDED;
  if (normalized === 'charged_back') return BillingPaymentStatus.CHARGEBACK;
  return BillingPaymentStatus.PENDING;
}
