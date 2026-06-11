import { readFileSync } from 'fs';
import { join } from 'path';

describe('fornecedor.html production frontend', () => {
  const root = join(__dirname, '..');

  it('carrega script real de fornecedores e desativa script legado inline', () => {
    const html = readFileSync(join(root, 'public', 'fornecedor.html'), 'utf8');

    expect(html).toContain('./Js/fornecedor.js');
    expect(html).toContain('data-legacy-demo-script="disabled"');
  });

  it('usa /api/suppliers como fonte de verdade e renderiza sem innerHTML para dados da API', () => {
    const script = readFileSync(join(root, 'public', 'Js', 'fornecedor.js'), 'utf8');

    expect(script).toContain('/api/suppliers');
    expect(script).toContain('textContent');
    expect(script).not.toContain('DEMO_FORNECEDORES');
    expect(script).not.toContain('li.innerHTML');
  });
});
