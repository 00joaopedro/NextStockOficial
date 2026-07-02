import { readFileSync } from 'fs';
import { join } from 'path';

describe('historico.html production sales integration', () => {
  const html = readFileSync(
    join(process.cwd(), 'public', 'historico.html'),
    'utf8',
  );
  const script = readFileSync(
    join(process.cwd(), 'public', 'Js', 'historico.js'),
    'utf8',
  );
  const ordersScript = readFileSync(
    join(process.cwd(), 'public', 'Js', 'pedido.js'),
    'utf8',
  );

  it('desativa o mock legado e carrega o script de producao', () => {
    expect(html).toContain('data-legacy-demo-script="disabled"');
    expect(html).toContain('./Js/historico.js');
    expect(script).not.toContain('DEMO_SALES_DATA');
  });

  it('usa Sales como fonte de verdade e pagina no backend', () => {
    expect(script).toContain('/api/sales?');
    expect(script).toContain('pageSize');
    expect(script).toContain('/api/sales/${encodeURIComponent(id)}');
    expect(script).toContain('/receipt');
  });

  it('valida profile e contexto antes da listagem', () => {
    expect(script).toContain('/api/auth/profile');
    expect(script).toContain('/api/system/context');
    expect(script).toContain('x-nextstock-branch-id');
  });

  it('diferencia recibo interno dos status fiscais', () => {
    expect(script).toContain('Recibo interno — sem validade fiscal');
    expect(script).toContain('internal_issued: "Recibo interno emitido"');
    expect(script).toContain('Reimprimir recibo interno');
    expect(html).toContain('Recibo interno — sem validade fiscal');
  });

  it('renderiza dados de API com textContent', () => {
    expect(script).toContain('element.textContent');
    expect(script).not.toContain('card.innerHTML');
    expect(script).not.toContain('productsList.innerHTML');
  });

  it('nao bloqueia pedidos em tenant Pet Shop', () => {
    expect(ordersScript).not.toContain('systemType !== "padrao"');
    expect(ordersScript).not.toContain(
      'Pedidos estão disponíveis somente no sistema padrão.',
    );
  });
});
