import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';

export const LOCAL_PASSWORD_MIN_LENGTH = 6;
export const LOCAL_PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_POLICY_MESSAGE =
  'A senha deve ter entre 6 e 128 caracteres e não conter caracteres de controle.';

export function validateLocalPassword(password: string): void {
  if (typeof password !== 'string') throw new Error('PASSWORD_INVALID');
  if (
    password.length < LOCAL_PASSWORD_MIN_LENGTH ||
    password.length > LOCAL_PASSWORD_MAX_LENGTH
  )
    throw new Error('PASSWORD_INVALID');
  if ([...password].some((char) => char === '\0' || /\p{Cc}/u.test(char)))
    throw new Error('PASSWORD_INVALID');
}

function bcryptInput(password: string) {
  return Buffer.byteLength(password, 'utf8') > 72
    ? createHash('sha256').update(password, 'utf8').digest('hex')
    : password;
}

export class PasswordHasher {
  private readonly rounds = Math.min(
    14,
    Math.max(10, Number(process.env.LOCAL_BCRYPT_ROUNDS || 12)),
  );

  async hash(password: string) {
    validateLocalPassword(password);
    return bcrypt.hash(bcryptInput(password), this.rounds);
  }

  /** Hashes a password only after a legacy provider has authenticated it. */
  async hashVerifiedLegacyPassword(password: string) {
    if (
      typeof password !== 'string' ||
      password.length < 8 ||
      password.length > LOCAL_PASSWORD_MAX_LENGTH
    ) {
      throw new Error('PASSWORD_INVALID');
    }
    if ([...password].some((char) => char === '\0' || /\p{Cc}/u.test(char))) {
      throw new Error('PASSWORD_INVALID');
    }
    if (Buffer.byteLength(password, 'utf8') > 72) {
      throw new Error('PASSWORD_TOO_LONG_FOR_BCRYPT');
    }
    return bcrypt.hash(password, this.rounds);
  }

  async compare(password: string, hash: string) {
    if (await bcrypt.compare(password, hash)) return true;
    return Buffer.byteLength(password, 'utf8') > 72
      ? bcrypt.compare(bcryptInput(password), hash)
      : false;
  }

  needsRehash(hash: string) {
    const match = /^\$2[aby]\$(\d\d)\$/.exec(hash);
    return !match || Number(match[1]) !== this.rounds;
  }

  async dummyCompare(password: string) {
    return bcrypt.compare(
      password,
      '$2b$12$C6UzMDM.H6dfI/f/IKcEe.V7rj2r2d8N7Wj4f8r2e6Y5vYVvQqQeK',
    );
  }
}
