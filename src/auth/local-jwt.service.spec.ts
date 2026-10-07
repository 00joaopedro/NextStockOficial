import { JwtService } from '@nestjs/jwt';
import { LocalJwtService } from './local-jwt.service';

describe('LocalJwtService', () => {
  const original = process.env;
  beforeEach(() => {
    process.env = {
      ...original,
      LOCAL_AUTH_JWT_ACTIVE_KEY: 'a'.repeat(48),
      LOCAL_AUTH_JWT_KID: 'active',
    };
  });
  afterAll(() => {
    process.env = original;
  });

  it('issues a JWT with stable identity claims and verifies it', async () => {
    const service = new LocalJwtService(new JwtService());
    const token = await service.sign({
      sub: 'profile-id',
      jti: 'jti-1',
      authMethod: 'password',
      credentialVersion: 1,
    });
    const payload = await service.verify(token);
    const decoded = service['jwt'].decode(token) as { iat: number; exp: number };
    expect(decoded.exp - decoded.iat).toBe(8 * 60 * 60);
    expect(payload.sub).toBe('profile-id');
    expect(payload.jti).toBe('jti-1');
    expect(payload.credentialVersion).toBe(1);
  });

  it('rejects an invalid configured TTL instead of issuing an unstable token', async () => {
    process.env.LOCAL_AUTH_JWT_TTL_SECONDS = '45';
    const service = new LocalJwtService(new JwtService());
    await expect(service.sign({
      sub: 'profile-id',
      jti: 'jti-ttl',
      authMethod: 'password',
    })).rejects.toThrow('Local JWT TTL is invalid.');
  });

  it('rejects a token signed with an unexpected algorithm or kid', async () => {
    const service = new LocalJwtService(new JwtService());
    const token = await service.sign({
      sub: 'profile-id',
      jti: 'jti-1',
      authMethod: 'password',
      credentialVersion: 1,
    });
    const parts = token.split('.');
    parts[0] = Buffer.from(
      JSON.stringify({ alg: 'none', kid: 'active', typ: 'JWT' }),
    ).toString('base64url');
    await expect(service.verify(parts.join('.'))).rejects.toThrow(
      'LOCAL_JWT_INVALID',
    );
  });
});
