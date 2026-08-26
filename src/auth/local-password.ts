import * as bcrypt from 'bcryptjs';

export const LOCAL_PASSWORD_MIN_LENGTH = 12;
export const LOCAL_PASSWORD_MAX_LENGTH = 128;

export function validateLocalPassword(password: string): void {
  if (typeof password !== 'string') throw new Error('PASSWORD_INVALID');
  if (password.length < LOCAL_PASSWORD_MIN_LENGTH || password.length > LOCAL_PASSWORD_MAX_LENGTH) throw new Error('PASSWORD_INVALID');
  if ([...password].some((char) => char === '\0' || /\p{Cc}/u.test(char))) throw new Error('PASSWORD_INVALID');
  if (Buffer.byteLength(password, 'utf8') > 72) throw new Error('PASSWORD_TOO_LONG_FOR_BCRYPT');
}

export class PasswordHasher {
  private readonly rounds = Math.min(14, Math.max(10, Number(process.env.LOCAL_BCRYPT_ROUNDS || 12)));

  async hash(password: string) {
    validateLocalPassword(password);
    return bcrypt.hash(password, this.rounds);
  }

  async compare(password: string, hash: string) {
    return bcrypt.compare(password, hash);
  }

  needsRehash(hash: string) {
    const match = /^\$2[aby]\$(\d\d)\$/.exec(hash);
    return !match || Number(match[1]) !== this.rounds;
  }

  async dummyCompare(password: string) {
    return bcrypt.compare(password, '$2b$12$C6UzMDM.H6dfI/f/IKcEe.V7rj2r2d8N7Wj4f8r2e6Y5vYVvQqQeK');
  }
}
