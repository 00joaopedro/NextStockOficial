import { readFileSync } from 'fs';
import { join } from 'path';

describe('funcionario.html production frontend', () => {
  const root = join(__dirname, '..');

  it('carrega script real e nao mantem array local como fonte principal', () => {
    const html = readFileSync(join(root, 'public', 'funcionario.html'), 'utf8');

    expect(html).toContain('./Js/funcionario.js');
    expect(html).toContain('id="email"');
    expect(html).not.toContain('const funcionarios = []');
  });

  it('usa /api/employees e nao expõe senha em listagem', () => {
    const script = readFileSync(join(root, 'public', 'Js', 'funcionario.js'), 'utf8');

    expect(script).toContain('/api/employees');
    expect(script).toContain('/reset-password');
    expect(script).not.toContain('senhaAcesso.value = employee');
  });
});
