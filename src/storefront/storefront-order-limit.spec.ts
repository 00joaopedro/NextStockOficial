import {
  normalizeStorefrontPhone,
  storefrontOrderLimitLockKey,
} from './storefront-order-limit';
import { validateSync } from 'class-validator';
import { FulfillmentType } from '@prisma/client';
import { CreateGuestOrderDto } from './dto/storefront-public.dto';

describe('RC-015 storefront active-order identity', () => {
  it.each([
    ['(11) 99999-0000', '11999990000'],
    ['+55 (11) 99999-0000', '5511999990000'],
    [' 11 99999 0000 ', '11999990000'],
  ])('canonicalizes %s', (input, expected) => {
    expect(normalizeStorefrontPhone(input)).toBe(expected);
  });

  it('accepts exactly twenty digits without truncation', () => {
    expect(normalizeStorefrontPhone('12345678901234567890')).toBe(
      '12345678901234567890',
    );
  });

  it.each(['123456789012345678901', '', 'letters-only', '1199999'])(
    'rejects invalid or out-of-range input %s',
    (input) => expect(() => normalizeStorefrontPhone(input)).toThrow(),
  );

  it('never merges numbers that differ after the twentieth digit', () => {
    expect(() => normalizeStorefrontPhone('123456789012345678901')).toThrow();
    expect(() => normalizeStorefrontPhone('123456789012345678902')).toThrow();
  });

  it('uses the same canonical policy in DTO validation', () => {
    const dto = Object.assign(new CreateGuestOrderDto(), {
      customerName: 'Customer',
      customerPhone: '123456789012345678901',
      fulfillmentType: FulfillmentType.pickup,
      items: [],
    });
    expect(
      validateSync(dto).some((error) => error.property === 'customerPhone'),
    ).toBe(true);
  });

  it('does not invent equivalence for country prefixes or leading zeroes', () => {
    expect(normalizeStorefrontPhone('+55 11 99999-0000')).not.toBe(
      normalizeStorefrontPhone('11 99999-0000'),
    );
    expect(normalizeStorefrontPhone('011999990000')).not.toBe(
      normalizeStorefrontPhone('11999990000'),
    );
  });

  it('maps equivalent formatting to the same stable advisory key', () => {
    const scope = {
      tenantId: 'tenant-a',
      storefrontId: 'store-a',
      branchId: 'branch-a',
      phone: '(11) 99999-0000',
    };
    const first = storefrontOrderLimitLockKey(scope);
    expect(first).toBe(storefrontOrderLimitLockKey(scope));
    expect(first).toBe(
      storefrontOrderLimitLockKey({ ...scope, phone: '11 99999 0000' }),
    );
  });

  it.each(['tenantId', 'storefrontId', 'branchId', 'phone'] as const)(
    'includes %s in the lock identity',
    (field) => {
      const scope = {
        tenantId: 'tenant-a',
        storefrontId: 'store-a',
        branchId: 'branch-a',
        phone: '11999990000',
      };
      expect(
        storefrontOrderLimitLockKey({
          ...scope,
          [field]: field === 'phone' ? '11999990001' : `${scope[field]}-b`,
        }),
      ).not.toBe(storefrontOrderLimitLockKey(scope));
    },
  );
});
