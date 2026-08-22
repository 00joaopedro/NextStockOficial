import { BadRequestException } from '@nestjs/common';
import { canonicalizeEmail } from './canonical-email';

describe('canonicalizeEmail', () => {
  it('normalizes whitespace, Unicode composition and case without Gmail rules', () => {
    expect(canonicalizeEmail('  User@Example.COM ')).toBe('user@example.com');
    expect(canonicalizeEmail('a+b@example.com')).toBe('a+b@example.com');
    expect(canonicalizeEmail('a.b@example.com')).not.toBe(canonicalizeEmail('ab@example.com'));
  });
  it('rejects invalid and oversized values', () => {
    expect(() => canonicalizeEmail('not-an-email')).toThrow(BadRequestException);
    expect(() => canonicalizeEmail('a'.repeat(321) + '@example.com')).toThrow(BadRequestException);
  });
});
