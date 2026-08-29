import { PasswordResetTokenService } from './password-reset-token.service';

describe('PasswordResetTokenService', () => {
  it('generates a 256-bit unpredictable token and stores only its digest', () => {
    const service = new PasswordResetTokenService();
    const first = service.generate();
    const second = service.generate();
    expect(first.raw).toHaveLength(43);
    expect(first.raw).not.toBe(second.raw);
    expect(first.hash).toHaveLength(64);
    expect(first.hash).toBe(service.hash(first.raw));
    expect(first.hash).not.toContain(first.raw);
  });
});
