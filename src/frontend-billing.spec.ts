import { readFileSync } from 'fs';
import { join } from 'path';

describe('billing frontend', () => {
  const html = readFileSync(join(process.cwd(), 'public', 'perfil.html'), 'utf8');
  const script = readFileSync(join(process.cwd(), 'public', 'Js', 'perfil.js'), 'utf8');

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

  it('retorno apenas consulta status e nao ativa plano localmente', () => {
    expect(script).toContain('/status');
    expect(script).toContain('O retorno do checkout não libera acesso');
    expect(script).not.toMatch(/subscription.*=.*ACTIVE/i);
  });
});
