import { readFileSync } from 'fs';
import { join } from 'path';

describe('caixa.html production PDV integration', () => {
  const html = readFileSync(
    join(process.cwd(), 'public', 'caixa.html'),
    'utf8',
  );
  const script = readFileSync(
    join(process.cwd(), 'public', 'Js', 'caixa.js'),
    'utf8',
  );

  it('desativa o checkout local legado e carrega o script real', () => {
    expect(html).toContain('data-legacy-cash-script="disabled"');
    expect(html).toContain('./Js/caixa.js');
    expect(script).not.toContain('produtosCatalogo');
  });

  it('valida perfil e contexto antes do PDV', () => {
    expect(script).toContain('/api/auth/profile');
    expect(script).toContain('/api/system/context');
    expect(script).toContain('x-nextstock-branch-id');
  });

  it('usa produtos, maquininhas e venda reais', () => {
    expect(script).toContain('/api/products/lookup?');
    expect(script).toContain('/api/payment-machines');
    expect(script).toContain('api("/api/sales"');
    expect(script).toContain('idempotencyKey');
  });

  it('suporta scan 1D/2D com Enter ou Tab e limite coerente', () => {
    expect(html).toContain('maxlength="512"');
    expect(html).toContain('./Js/scan-code.js');
    expect(script).toContain('["Enter", "Tab"].includes(event.key)');
    expect(script).toContain('normalizeScanCode');
    expect(script).not.toContain('window.open(scanned');
  });

  it('implementa autocomplete limitado, cancelavel e sem busy global por tecla', () => {
    expect(script).toContain('setTimeout(async () =>');
    expect(script).toContain('}, 250)');
    expect(script).toContain('new AbortController()');
    expect(script).toContain('searchSequence');
    expect(script).toContain('limit: "10"');
    expect(script).toContain('products.slice(0, 10)');
    expect(script).toContain('els.searchInput.addEventListener("input"');
  });

  it('abre sugestoes para cima e oferece navegacao acessivel', () => {
    expect(html).toContain('bottom: calc(100% + 6px)');
    expect(html).toContain('position: absolute');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('role="listbox"');
    expect(script).toContain('button.setAttribute("role", "option")');
    expect(script).toContain('"aria-selected"');
    expect(script).toContain('"aria-activedescendant"');
    expect(script).toContain('event.key === "ArrowDown"');
    expect(script).toContain('event.key === "ArrowUp"');
    expect(script).toContain('event.key === "Escape"');
  });

  it('usa saleId para recibo e nota fiscal', () => {
    expect(script).toContain('/model-65/print');
    expect(script).toContain('ntfe.html?saleId=');
    expect(script).not.toContain('nextstockNotaFiscalPendente');
    expect(script).not.toContain('nextstockUltimaVendaPaga');
  });

  it('nao permite que o navegador escolha tipo ou ambiente fiscal', () => {
    expect(script).not.toContain('documentType:');
    expect(script).not.toContain('tpAmb');
    expect(script).not.toContain('forceInternal');
    expect(script).not.toContain('isFiscal');
    expect(script).toContain('state.printing');
    expect(script).toContain('result.mode === "nfce65"');
    expect(script).toContain('result.mode !== "internal_receipt"');
  });

  it('rotula fallback como recibo interno sem validade fiscal', () => {
    expect(html).toContain('IMPRIMIR RECIBO INTERNO');
    expect(html).toContain('sem validade fiscal');
    expect(script).toContain('Recibo interno gerado');
  });

  it('renderiza dados de API com DOM seguro e bloqueia granel', () => {
    expect(script).toContain('textContent');
    expect(script).toContain('replaceChildren');
    expect(script).not.toContain('.innerHTML');
    expect(script).toContain('Venda por granel esta bloqueada');
  });
});
