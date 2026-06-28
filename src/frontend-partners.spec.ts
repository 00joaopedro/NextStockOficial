import { readFileSync } from 'fs';
import { join } from 'path';

describe('parceiros frontend production integration', () => {
  const html = readFileSync(
    join(process.cwd(), 'public', 'parceiros.html'),
    'utf8',
  );
  const script = readFileSync(
    join(process.cwd(), 'public', 'Js', 'parceiros.ts'),
    'utf8',
  );

  it('nao contem mock, senha ou persistencia comercial local', () => {
    expect(html).not.toMatch(/senha|mock|localStorage/i);
    expect(script).not.toMatch(/password|senha|initialPartners|localStorage/i);
  });

  it('usa sessao httpOnly e endpoints reais', () => {
    expect(script).toContain('credentials: "include"');
    expect(script).toContain('"/auth/profile"');
    expect(script).toContain('"/partners"');
    expect(script).toContain('/referral-link/status');
    expect(script).toContain('/payment-status');
  });

  it('bloqueia visualmente quem nao e Dev SuperAdmin', () => {
    expect(script).toContain('user?.isDevSuperAdmin === true');
    expect(html).toContain('body data-locked="true"');
  });
});
