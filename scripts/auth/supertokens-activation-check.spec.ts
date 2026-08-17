import { validateSuperTokensConnectionUri } from './supertokens-activation-check';

describe('SuperTokens Core connection URI', () => {
  it('accepts HTTP Core URIs without embedded credentials', () => {
    expect(
      validateSuperTokensConnectionUri('http://127.0.0.1:3567/').toString(),
    ).toBe('http://127.0.0.1:3567/');
  });

  it('rejects embedded credentials and PostgreSQL URLs', () => {
    expect(() =>
      validateSuperTokensConnectionUri('http://user:password@127.0.0.1:3567'),
    ).toThrow('embedded credentials');
    expect(() =>
      validateSuperTokensConnectionUri(
        'postgresql://user:password@127.0.0.1:5434/core',
      ),
    ).toThrow('HTTP URL');
  });
});
