import {
  decideSuperTokensCanary,
  readSuperTokensCanaryPolicy,
} from './supertokens-canary-policy';

describe('SuperTokens canary policy', () => {
  it('defaults disabled and fails closed on contradictory flags', () => {
    expect(readSuperTokensCanaryPolicy()).toMatchObject({
      enabled: false,
      killSwitch: false,
      percentage: 0,
    });
    expect(() =>
      readSuperTokensCanaryPolicy({
        AUTH_CANARY_ENABLED: 'true',
        AUTH_CANARY_KILL_SWITCH: 'true',
      }),
    ).toThrow();
  });

  it('uses explicit allowlist and deterministic percentage without email logging', () => {
    const policy = readSuperTokensCanaryPolicy({
      AUTH_CANARY_ENABLED: 'true',
      AUTH_CANARY_ALLOWLIST: 'profile-synthetic',
      AUTH_CANARY_PERCENTAGE: '25',
    });
    expect(decideSuperTokensCanary('profile-synthetic', policy)).toBe(
      'SUPERTOKENS',
    );
    expect(decideSuperTokensCanary('profile-synthetic', policy)).toBe(
      'SUPERTOKENS',
    );
  });

  it.each(['TRUE', 'False', '1', '0', 'yes', '', 'ture'])(
    'rejects invalid boolean %s',
    (value) => {
      expect(() =>
        readSuperTokensCanaryPolicy({ AUTH_CANARY_ENABLED: value }),
      ).toThrow('exactly true or false');
    },
  );

  it('defaults absent boolean flags to false', () => {
    expect(readSuperTokensCanaryPolicy({}).enabled).toBe(false);
    expect(readSuperTokensCanaryPolicy({}).killSwitch).toBe(false);
  });

  it('keeps an enabled empty selector on legacy routing', () => {
    const policy = readSuperTokensCanaryPolicy({ AUTH_CANARY_ENABLED: 'true' });
    expect(decideSuperTokensCanary('profile-synthetic', policy)).toBe('LEGACY');
  });

  it('kill switch always returns legacy', () => {
    expect(
      decideSuperTokensCanary('profile-synthetic', {
        enabled: false,
        killSwitch: true,
        allowlist: new Set(['profile-synthetic']),
        percentage: 100,
      }),
    ).toBe('LEGACY');
  });
});
