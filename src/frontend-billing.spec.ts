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

describe('billing frontend', () => {
  const html = readFileSync(
    join(process.cwd(), 'public', 'perfil.html'),
    'utf8',
  );
  const script = readFileSync(
    join(process.cwd(), 'public', 'Js', 'perfil.js'),
    'utf8',
  );

  it('nao expoe links Mercado Pago nem endpoint legado de troca direta', () => {
    expect(html).not.toContain('mpago.la');
    expect(script).not.toContain('mpago.la');
    expect(script).not.toContain('/api/profile/plan');
  });

  it('carrega billing e inicia checkout somente pelo backend', () => {
    expect(script).toContain('/api/billing/plans');
    expect(script).toContain('/api/billing/subscription');
    expect(script).toContain('/api/billing/checkout');
    expect(script).toContain('body: JSON.stringify({ planSlug })');
  });

  it('mantem uma chave por intencao/plano ate receber URL valida', () => {
    expect(script).toContain('nextstockBillingIntent:${planSlug}');
    expect(script.match(/crypto\.randomUUID\(\)/g)).toHaveLength(1);
    expect(script).toContain('sessionStorage.getItem(storageKey)');
    expect(script).toContain('if (!idempotencyKey)');
    expect(script).toContain('"Idempotency-Key": idempotencyKey');
    expect(script.indexOf('if (!checkout.checkoutUrl)')).toBeLessThan(
      script.indexOf('sessionStorage.removeItem(storageKey)'),
    );
    expect(script).not.toMatch(/catch[^}]*randomUUID/s);
  });

  it('retorno apenas consulta status e nao ativa plano localmente', () => {
    expect(script).toContain('/status');
    expect(script).toContain('O retorno do checkout não libera acesso');
    expect(script).not.toMatch(/subscription.*=.*ACTIVE/i);
  });
});
