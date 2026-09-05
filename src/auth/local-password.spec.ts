import { PasswordHasher, validateLocalPassword } from './local-password';

describe('local password policy', () => {
  it('accepts spaces, symbols and unicode without composition rules', () => {
    expect(() =>
      validateLocalPassword('Senha local segura! 你好'),
    ).not.toThrow();
  });

  it('rejects short, control-character and bcrypt-overlong passwords', () => {
    expect(() => validateLocalPassword('short')).toThrow('PASSWORD_INVALID');
    expect(() =>
      validateLocalPassword(`senha segura ${String.fromCharCode(0)}`),
    ).toThrow('PASSWORD_INVALID');
    expect(() => validateLocalPassword('a'.repeat(73))).toThrow(
      'PASSWORD_TOO_LONG_FOR_BCRYPT',
    );
  });

  it('hashes and compares without exposing the password', async () => {
    const hasher = new PasswordHasher();
    const hash = await hasher.hash('Senha local segura!');
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(hash).not.toContain('Senha local segura!');
    await expect(hasher.compare('Senha local segura!', hash)).resolves.toBe(
      true,
    );
    await expect(hasher.compare('senha errada', hash)).resolves.toBe(false);
  });

  it('hashes only already-verified legacy passwords in the legacy range', async () => {
    const hasher = new PasswordHasher();
    await expect(hasher.hash('short')).rejects.toThrow('PASSWORD_INVALID');
    const hash = await hasher.hashVerifiedLegacyPassword('12345678');
    await expect(hasher.compare('12345678', hash)).resolves.toBe(true);
    await expect(
      hasher.hashVerifiedLegacyPassword('x\0xxxxxx'),
    ).rejects.toThrow('PASSWORD_INVALID');
  });
});
