import { SetMetadata } from '@nestjs/common';

export const BILLING_EXEMPT_KEY = 'nextstock:billing-exempt';
export const BillingExempt = () => SetMetadata(BILLING_EXEMPT_KEY, true);
