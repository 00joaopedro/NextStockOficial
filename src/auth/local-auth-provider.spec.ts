import { AuthProviderError } from './auth-provider';
import { LocalAuthProvider } from './local-auth-provider';

describe('LocalAuthProvider', () => {
  const prisma = {
    userProfile: { findUnique: jest.fn() },
    localCredential: { findFirst: jest.fn() },
  };
  const jwt = { sign: jest.fn() };
  const passwords = {
    hash: jest.fn().mockResolvedValue('$2b$12$hash'),
    compare: jest.fn(),
    dummyCompare: jest.fn().mockResolvedValue(false),
  };
  let provider: LocalAuthProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new LocalAuthProvider(
      prisma as any,
      jwt as any,
      passwords as any,
    );
  });

  it('validates and creates a local identity without persisting a password', async () => {
    prisma.userProfile.findUnique.mockResolvedValue(null);
    const identity = await provider.createUser({
      email: 'user@example.com',
      password: 'LongPassword12',
    });
    expect(identity.id).toEqual(expect.any(String));
    expect(passwords.hash).toHaveBeenCalledWith('LongPassword12');
  });

  it('rejects duplicate emails generically', async () => {
    prisma.userProfile.findUnique.mockResolvedValue({ id: 'profile-1' });
    await expect(
      provider.createUser({
        email: 'user@example.com',
        password: 'LongPassword12',
      }),
    ).rejects.toBeInstanceOf(AuthProviderError);
  });

  it('uses a dummy comparison for an unknown account', async () => {
    prisma.localCredential.findFirst.mockResolvedValue(null);
    await expect(
      provider.login({
        email: 'missing@example.com',
        password: 'LongPassword12',
      }),
    ).rejects.toMatchObject({ code: 'invalid_credentials' });
    expect(passwords.dummyCompare).toHaveBeenCalled();
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it('issues a local JWT only after a valid credential', async () => {
    prisma.localCredential.findFirst.mockResolvedValue({
      profileId: 'profile-1',
      passwordHash: 'hash',
      credentialVersion: 2,
      status: 'active',
      profile: { email: 'user@example.com', employee: null },
    });
    passwords.compare.mockResolvedValue(true);
    jwt.sign.mockResolvedValue('signed-local-jwt');
    const result = await provider.login({
      email: 'user@example.com',
      password: 'LongPassword12',
    });
    expect(result.accessToken).toBe('signed-local-jwt');
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'profile-1', credentialVersion: 2 }),
    );
  });
});
