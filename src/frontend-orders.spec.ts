import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..');

describe('orders frontend production flow', () => {
  it('pedido.html usa script real e deixa DEMO_ORDERS restrito ao modo demo', () => {
    const html = readFileSync(join(root, 'public', 'pedido.html'), 'utf8');
    const script = readFileSync(
      join(root, 'public', 'Js', 'pedido.js'),
      'utf8',
    );

    expect(html).toContain('if (window.isNextStockDemoMode?.())');
    expect(html).toContain('./Js/pedido.js');
    expect(script).toContain('/orders?');
    expect(script).toContain('/orders/${orderId}/deliver');
    expect(script).toContain('/orders/${orderId}/cancel');
    expect(script).toContain('/orders/${orderId}/receipt');
    expect(script).toContain('if (data.html)');
    expect(script).toContain('frame.contentDocument.write(data.html)');
  });

  it('produtos.html cria pedido real via /api/orders em producao', () => {
    const html = readFileSync(join(root, 'public', 'produtos.html'), 'utf8');

    expect(html).toContain('ordersApiFetch("/orders"');
    expect(html).toContain('customerName: clientData.fullName');
    expect(html).toContain('items: orderPayload.items.map');
    expect(html).toContain('loadClientOrdersFromBackend');
  });

  it('ntfe.html busca rascunho fiscal por orderId em vez de depender do pedido inteiro no sessionStorage', () => {
    const html = readFileSync(join(root, 'public', 'ntfe.html'), 'utf8');

    expect(html).toContain(
      '/api/orders/${encodeURIComponent(orderId)}/nfe-draft',
    );
    expect(html).toContain(
      'const orderId = new URLSearchParams(window.location.search).get("orderId")',
    );
    expect(html).toContain('loadOrderDraft(orderId)');
  });
});
