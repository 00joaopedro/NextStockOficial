import { getPasswordRecoveryRedirectUrl } from './password-recovery-url';

describe('password recovery redirect URL', () => {
  it('uses the public staging URL and the real reset route', () => {
    expect(
      getPasswordRecoveryRedirectUrl({
        APP_ENV: 'staging',
        PUBLIC_APP_URL: 'https://nextstockoficial-dominio-teste.up.railway.app',
      }),
    ).toBe(
      'https://nextstockoficial-dominio-teste.up.railway.app/reset-password.html',
    );
  });

  it('rejects localhost in production', () => {
    expect(() =>
      getPasswordRecoveryRedirectUrl({
        APP_ENV: 'production',
        PUBLIC_APP_URL: 'https://localhost:3000',
      }),
    ).toThrow('localhost');
  });

  it.each(['127.0.0.1', '::1'])('rejects %s in staging', (hostname) => {
    const urlHostname = hostname === '::1' ? '[::1]' : hostname;
    expect(() =>
      getPasswordRecoveryRedirectUrl({
        APP_ENV: 'staging',
        PUBLIC_APP_URL: `https://${urlHostname}:3000`,
      }),
    ).toThrow('localhost');
  });

  it('allows localhost for local development', () => {
    expect(
      getPasswordRecoveryRedirectUrl({
        NODE_ENV: 'development',
        PUBLIC_APP_URL: 'http://localhost:3000',
      }),
    ).toBe('http://localhost:3000/reset-password.html');
  });

  it('requires HTTPS in staging', () => {
    expect(() =>
      getPasswordRecoveryRedirectUrl({
        APP_ENV: 'staging',
        PUBLIC_APP_URL: 'http://staging.example.test',
      }),
    ).toThrow('HTTPS');
  });
});
