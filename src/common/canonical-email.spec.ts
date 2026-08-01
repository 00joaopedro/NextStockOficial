import { canonicalizeEmail } from './canonical-email';

describe('canonicalizeEmail', () => {
  it.each([
    [' User@Example.COM ', 'user@example.com'],
    ['ÜSER@EXAMPLE.COM', 'üser@example.com'],
  ])('canonicalizes %s once for identity claims', (input, expected) => {
    expect(canonicalizeEmail(input)).toBe(expected);
  });
});
