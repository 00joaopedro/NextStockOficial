import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

export const PASSWORD_RESET_TTL_MS = 15 * 60_000;

@Injectable()
export class PasswordResetTokenService {
  generate() {
    const raw = randomBytes(32).toString('base64url');
    return { raw, hash: this.hash(raw) };
  }

  hash(raw: string) {
    return createHash('sha256').update(raw, 'utf8').digest('hex');
  }
}
