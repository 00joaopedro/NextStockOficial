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

describe('funcionario.html production frontend', () => {
  const root = join(__dirname, '..');

  it('carrega script real e nao mantem array local como fonte principal', () => {
    const html = readFileSync(join(root, 'public', 'funcionario.html'), 'utf8');

    expect(html).toContain('./Js/funcionario.js');
    expect(html).toContain('id="email"');
    expect(html).not.toContain('const funcionarios = []');
  });

  it('usa /api/employees e nao expõe senha em listagem', () => {
    const script = readFileSync(
      join(root, 'public', 'Js', 'funcionario.js'),
      'utf8',
    );

    expect(script).toContain('/api/employees');
    expect(script).toContain('/reset-password');
    expect(script).not.toContain('senhaAcesso.value = employee');
  });

  it('alinha criação e reset de funcionário à política de 6 a 128 caracteres', () => {
    const html = readFileSync(join(root, 'public', 'funcionario.html'), 'utf8');
    const script = readFileSync(join(root, 'public', 'Js', 'funcionario.js'), 'utf8');

    expect(html).toContain('minlength="6" maxlength="128"');
    expect(html).toContain('Senha entre 6 e 128 caracteres');
    expect(script).toContain('payload.password.length < 6');
    expect(script).toContain('password.length < 6');
    expect(script).toContain('entre 6 e 128 caracteres');
    expect(script).not.toMatch(/password\.length\s*<\s*8/);
    expect(script).not.toContain('pelo menos 8');
  });
});

describe('reset password frontend', () => {
  it('preserves the real page pathname while removing query and fragment', () => {
    const script = readFileSync(
      join(__dirname, '..', 'public', 'Js', 'reset-password.ts'),
      'utf8',
    );
    expect(script).toContain('window.location.pathname');
    expect(script).not.toContain("'/reset-password'");
  });

  it('announces the six character registration minimum', () => {
    const html = readFileSync(
      join(__dirname, '..', 'public', 'index.html'),
      'utf8',
    );
    const script = readFileSync(
      join(
        __dirname,
        '..',
        'public',
        'Js',
        'csp-extracted',
        'index-inline1.js',
      ),
      'utf8',
    );
    expect(html).toContain('minlength="6"');
    expect(html).toContain('pattern="[A-Za-z0-9]{6,128}"');
    expect(html).toContain('entre 6 e 128');
    expect(script).toContain('{6,128}');
    expect(script).toContain('entre 6 e 128');
  });
});

describe('reset password frontend', () => {
  it('preserves the real page pathname while removing query and fragment', () => {
    const script = readFileSync(
      join(__dirname, '..', 'public', 'Js', 'reset-password.ts'),
      'utf8',
    );
    expect(script).toContain('window.location.pathname');
    expect(script).not.toContain("'/reset-password'");
  });

  it('employee password frontend matches the configured password policy', () => {
    const html = readFileSync(
      join(__dirname, '..', 'public', 'index.html'),
      'utf8',
    );
    const script = readFileSync(
      join(
        __dirname,
        '..',
        'public',
        'Js',
        'csp-extracted',
        'index-inline1.js',
      ),
      'utf8',
    );
    expect(html).toContain('minlength="6"');
    expect(html).toContain('pattern="[A-Za-z0-9]{6,128}"');
    expect(html).toContain('entre 6 e 128');
    expect(script).toContain('{6,128}');
    expect(script).toContain('entre 6 e 128');
  });
});
