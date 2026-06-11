import { readFileSync } from 'fs';
import { join } from 'path';

describe('despesas.html production frontend', () => {
  const root = join(__dirname, '..');

  it('carrega script real de despesas e desativa script legado inline', () => {
    const html = readFileSync(join(root, 'public', 'despesas.html'), 'utf8');

    expect(html).toContain('./Js/despesas.js');
    expect(html).toContain('data-legacy-demo-script="disabled"');
  });

  it('usa /api/expenses como fonte de verdade e envia anexos via FormData', () => {
    const script = readFileSync(join(root, 'public', 'Js', 'despesas.js'), 'utf8');

    expect(script).toContain('/api/expenses');
    expect(script).toContain('new FormData()');
    expect(script).toContain('formData.append("file", file)');
    expect(script).not.toContain('DEMO_EXPENSES');
    expect(script).not.toContain('URL.createObjectURL');
  });
});
