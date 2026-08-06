import { AuthProviderError } from './auth-provider';
import { FakeSuperTokensAdapter } from './supertokens-adapter';

describe('fake SuperTokens adapter', () => {
  it('supports deterministic fault injection without network or password persistence', async () => {
    const adapter = new FakeSuperTokensAdapter();
    await expect(adapter.authenticate('user@example.com', 'secret')).resolves.toEqual({ providerUserId: 'fake:user@example.com', canonicalEmail: 'user@example.com' });
    adapter.setFault('unavailable');
    await expect(adapter.authenticate('user@example.com', 'secret')).rejects.toMatchObject({ code: 'provider_unavailable' } satisfies Partial<AuthProviderError>);
    expect(adapter.calls).toEqual(['authenticate', 'authenticate']);
  });
});
