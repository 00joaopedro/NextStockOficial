import { readFileSync } from 'fs';
import { join } from 'path';

describe('fornecedor.html production frontend', () => {
  const root = join(__dirname, '..');

  it('carrega producao e restringe a demonstracao inline ao preview publico', () => {
    const html = readFileSync(join(root, 'public', 'fornecedor.html'), 'utf8');

    expect(html).toContain('./Js/fornecedor.js');
    expect(html).toContain('if (window.isNextStockDemoMode?.()) {');
    expect(html).toContain('DEMO_FORNECEDORES');
  });

  it('usa /api/suppliers como fonte de verdade e renderiza sem innerHTML para dados da API', () => {
    const script = readFileSync(join(root, 'public', 'Js', 'fornecedor.js'), 'utf8');

    expect(script).toContain('/api/suppliers');
    expect(script).toContain('textContent');
    expect(script).not.toContain('DEMO_FORNECEDORES');
    expect(script).not.toContain('li.innerHTML');
  });
});
