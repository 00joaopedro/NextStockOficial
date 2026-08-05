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

describe('fornecedor.html production frontend', () => {
  const root = join(__dirname, '..');

  it('carrega producao e restringe a demonstracao inline ao preview publico', () => {
    const html = pageSource(root, 'fornecedor.html');

    expect(html).toContain('./Js/fornecedor.js');
    expect(html).toContain('if (window.isNextStockDemoMode?.()) {');
    expect(html).toContain('DEMO_FORNECEDORES');
  });

  it('usa /api/suppliers como fonte de verdade e renderiza sem innerHTML para dados da API', () => {
    const script = readFileSync(
      join(root, 'public', 'Js', 'fornecedor.js'),
      'utf8',
    );

    expect(script).toContain('/api/suppliers');
    expect(script).toContain('textContent');
    expect(script).not.toContain('DEMO_FORNECEDORES');
    expect(script).not.toContain('li.innerHTML');
  });
});
