import { JwtService } from '@nestjs/jwt';
import { LocalJwtService } from './local-jwt.service';

describe('LocalJwtService', () => {
  const original = process.env;
  beforeEach(() => {
    process.env = { ...original, LOCAL_AUTH_JWT_ACTIVE_KEY: 'a'.repeat(48), LOCAL_AUTH_JWT_KID: 'active' };
  });
  afterAll(() => { process.env = original; });

  it('issues a short JWT with stable identity claims and verifies it', async () => {
    const service = new LocalJwtService(new JwtService());
    const token = await service.sign({ sub: 'profile-id', jti: 'jti-1', credentialVersion: 1 });
    const payload = await service.verify(token);
    expect(payload.sub).toBe('profile-id');
    expect(payload.jti).toBe('jti-1');
    expect(payload.credentialVersion).toBe(1);
  });

  it('rejects a token signed with an unexpected algorithm or kid', async () => {
    const service = new LocalJwtService(new JwtService());
    const token = await service.sign({ sub: 'profile-id', jti: 'jti-1', credentialVersion: 1 });
    const parts = token.split('.');
    parts[0] = Buffer.from(JSON.stringify({ alg: 'none', kid: 'active', typ: 'JWT' })).toString('base64url');
    await expect(service.verify(parts.join('.'))).rejects.toThrow('LOCAL_JWT_INVALID');
  });
});
