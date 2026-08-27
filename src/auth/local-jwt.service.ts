import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export type LocalJwtPayload = {
  sub: string;
  jti: string;
  credentialVersion: number;
};

@Injectable()
export class LocalJwtService {
  constructor(private readonly jwt: JwtService) {}

  sign(payload: LocalJwtPayload) {
    const secret = process.env.LOCAL_AUTH_JWT_ACTIVE_KEY?.trim();
    if (!secret || secret.length < 32)
      throw new Error('LOCAL_AUTH_JWT_ACTIVE_KEY is not configured.');
    return this.jwt.signAsync(payload, {
      secret,
      algorithm: 'HS256',
      issuer: process.env.LOCAL_AUTH_JWT_ISSUER || 'nextstock-local-auth',
      audience: process.env.LOCAL_AUTH_JWT_AUDIENCE || 'nextstock-api',
      expiresIn: Number(process.env.LOCAL_AUTH_JWT_TTL_SECONDS || 300),
      keyid: process.env.LOCAL_AUTH_JWT_KID || 'active',
    });
  }

  async verify(token: string) {
    const keys = [
      {
        secret: process.env.LOCAL_AUTH_JWT_ACTIVE_KEY,
        kid: process.env.LOCAL_AUTH_JWT_KID || 'active',
      },
      {
        secret: process.env.LOCAL_AUTH_JWT_PREVIOUS_KEY,
        kid: process.env.LOCAL_AUTH_JWT_PREVIOUS_KID || 'previous',
      },
    ].filter((entry): entry is { secret: string; kid: string } =>
      Boolean(entry.secret && entry.secret.length >= 32),
    );
    if (!keys.length)
      throw new Error('LOCAL_AUTH_JWT_ACTIVE_KEY is not configured.');
    const decoded = this.jwt.decode(token, { complete: true });
    const header =
      decoded && typeof decoded === 'object' && 'header' in decoded
        ? (decoded.header as { kid?: string; alg?: string })
        : null;
    if (
      !header ||
      header.alg !== 'HS256' ||
      !keys.some((key) => key.kid === header.kid)
    )
      throw new Error('LOCAL_JWT_INVALID');
    return this.jwt.verifyAsync<LocalJwtPayload>(token, {
      secret: keys.find((key) => key.kid === header.kid)!.secret,
      algorithms: ['HS256'],
      issuer: process.env.LOCAL_AUTH_JWT_ISSUER || 'nextstock-local-auth',
      audience: process.env.LOCAL_AUTH_JWT_AUDIENCE || 'nextstock-api',
    });
  }
}
