import { readFileSync } from 'fs';
import { join } from 'path';

function pageSource(root: string, file: string) {
  const html = readFileSync(join(root, 'public', file), 'utf8');
  const extracted = file.replace(/\.html$/, '-inline1.js');
  try {
    return `${html}\n${readFileSync(join(root, 'public', 'Js', 'csp-extracted', extracted), 'utf8')}`;
  } catch {
    return html;
  }
}

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
    expect(script).toMatch(/credentials: ['"]include['"]/);
    expect(script).toMatch(/['"]\/auth\/profile['"]/);
    expect(script).toMatch(/['"]\/partners['"]/);
    expect(script).toContain('/referral-link/status');
    expect(script).toContain('/payment-status');
  });

  it('bloqueia visualmente quem nao e Dev SuperAdmin', () => {
    expect(script).toContain('user?.isDevSuperAdmin === true');
    expect(html).toContain('body data-locked="true"');
  });
});
