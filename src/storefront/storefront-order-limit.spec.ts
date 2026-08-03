import {
  normalizeStorefrontPhone,
  storefrontOrderLimitLockKey,
} from './storefront-order-limit';

describe('RC-015 storefront active-order identity', () => {
  it.each([
    ['(11) 99999-0000', '11999990000'],
    ['+55 (11) 99999-0000', '5511999990000'],
    [' 11 99999 0000 ', '11999990000'],
  ])('canonicalizes %s', (input, expected) => {
    expect(normalizeStorefrontPhone(input)).toBe(expected);
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
