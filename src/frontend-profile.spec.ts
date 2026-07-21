import { readFileSync } from 'fs';
import { join } from 'path';

describe('perfil frontend production contract', () => {
  const html = readFileSync(
    join(process.cwd(), 'public', 'perfil.html'),
    'utf8',
  );
  const script = readFileSync(
    join(process.cwd(), 'public', 'Js', 'perfil.js'),
    'utf8',
  );

  it('usa bootstrap autenticado e APIs reais', () => {
    expect(script).toContain('/api/auth/profile');
    expect(script).toContain('/api/system/context');
    expect(script).toContain('/api/profile/me');
    expect(script).toContain('/api/profile/company');
    expect(script).toContain('/api/billing/subscription');
    expect(script).toContain('/api/billing/plans');
    expect(script).toContain('/api/payment-machines');
  });

  it('nao usa innerHTML para dados de perfil, plano ou maquininha', () => {
    expect(script).not.toContain('.innerHTML');
    expect(script).toContain('textContent');
    expect(script).toContain('createElement');
  });

  it('nao deixa mocks de planos ou maquinas no HTML inicial', () => {
    expect(html).not.toContain('<h4>Ouro</h4>');
    expect(html).not.toContain('<h4>Stone - Caixa Principal</h4>');
    expect(html).toContain('id="plansGrid"');
    expect(html).toContain('id="machineList"');
  });

  it('usa o mesmo layout fixo e responsivo da sidebar das demais paginas', () => {
    expect(html).toContain('.sidebar{width:16vw');
    expect(html).toContain('height:100vh;position:fixed');
    expect(html).toContain('main{margin-left:16vw');
    expect(html).toContain('.sidebar{width:100%;height:auto;position:relative');
    expect(html).not.toContain('#sidebar-container{display:none}');
  });

  it('envia suporte Dev somente quando branch e modo conferem', () => {
    expect(script).toContain('support?.branchId === state.selectedBranch?.id');
    expect(script).toContain('support?.mode === "support"');
    expect(script).toContain('"x-nextstock-dev-context"');
  });
});
