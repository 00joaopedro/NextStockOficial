import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { localJwtConfig, localJwtKeyForKid } from './local-jwt-config';

export type LocalJwtPayload = {
  sub: string;
  jti: string;
  credentialVersion: number;
};

@Injectable()
export class LocalJwtService {
  constructor(private readonly jwt: JwtService) {}

  assertSigningConfigured() {
    localJwtConfig();
  }

  sign(payload: LocalJwtPayload) {
    const config = localJwtConfig();
    return this.jwt.signAsync(payload, {
      secret: config.active.secret,
      algorithm: 'HS256',
      issuer: config.issuer,
      audience: config.audience,
      expiresIn: config.ttlSeconds,
      keyid: config.active.kid,
    });
  }

  async verify(token: string) {
    localJwtConfig();
    const decoded = this.jwt.decode(token, { complete: true });
    const header =
      decoded && typeof decoded === 'object' && 'header' in decoded
        ? (decoded.header as { kid?: string; alg?: string })
        : null;
    if (!header || header.alg !== 'HS256')
      throw new Error('LOCAL_JWT_INVALID');
    const key = localJwtKeyForKid(header.kid);
    return this.jwt.verifyAsync<LocalJwtPayload>(token, {
      secret: key.secret,
      algorithms: ['HS256'],
      issuer: localJwtConfig().issuer,
      audience: localJwtConfig().audience,
    });
  }
}
