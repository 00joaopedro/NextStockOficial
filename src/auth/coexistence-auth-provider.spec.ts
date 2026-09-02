import { CoexistenceAuthProvider } from './coexistence-auth-provider';
import { AuthProviderError } from './auth-provider';

describe('CoexistenceAuthProvider', () => {
  const local = { login: jest.fn(), createUser: jest.fn() };
  const supabase = { login: jest.fn() };
  const prisma = { localCredential: { findFirst: jest.fn() } };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AUTH_LEGACY_FALLBACK_ENABLED = 'true';
  });

  it('uses local whenever a credential exists, including inactive/invalid ones', async () => {
    prisma.localCredential.findFirst.mockResolvedValue({ id: 'credential' });
    local.login.mockResolvedValue({ accessToken: 'local', identity: { id: 'p' } });
    const result = await new CoexistenceAuthProvider(prisma as any, local as any, supabase as any).login({ email: 'a@b.com', password: 'wrong' });
    expect(result.provider).toBe('local');
    expect(supabase.login).not.toHaveBeenCalled();
  });

  it('uses legacy only when no local credential exists and fallback is enabled', async () => {
    prisma.localCredential.findFirst.mockResolvedValue(null);
    supabase.login.mockResolvedValue({ accessToken: 'supabase', identity: { id: 's' } });
    const result = await new CoexistenceAuthProvider(prisma as any, local as any, supabase as any).login({ email: 'a@b.com', password: 'password' });
    expect(result.provider).toBe('supabase');
    expect(supabase.login).toHaveBeenCalledTimes(1);
  });

  it('blocks legacy fallback when disabled', async () => {
    process.env.AUTH_LEGACY_FALLBACK_ENABLED = 'false';
    prisma.localCredential.findFirst.mockResolvedValue(null);
    await expect(new CoexistenceAuthProvider(prisma as any, local as any, supabase as any).login({ email: 'a@b.com', password: 'password' })).rejects.toMatchObject({ code: 'invalid_credentials' } satisfies Partial<AuthProviderError>);
    expect(supabase.login).not.toHaveBeenCalled();
  });
});
