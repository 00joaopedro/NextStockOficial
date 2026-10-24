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
    expect(script).toContain('/api/billing/subscription/server-usage');
    expect(script).toContain('/api/billing/subscription/plan-change');
    expect(script).toContain('/api/payment-machines');
  });

  it('programa troca de plano com confirmação explícita e chave idempotente', () => {
    expect(script).toContain('Programar a mudança para');
    expect(script).toContain('Idempotency-Key');
    expect(script).toContain('próxima renovação');
  });

  it('exibe somente percentual de uso estimado para administradores', () => {
    expect(html).toContain('id="serverUsagePanel"');
    expect(script).toContain('if (!state.canManage || !el.serverUsagePanel) return;');
    expect(script).toContain('usage.percentage');
    expect(script).not.toContain('estimatedCostCents');
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

  it('mostra alerta de assinatura somente para o trial expirado', () => {
    expect(html).toContain('id="trialExpiredAlert"');
    expect(html).toContain('role="alert"');
    expect(script).toContain('entitlement?.reason === "TRIAL_EXPIRED"');
    expect(script).toContain('Escolha um plano abaixo para continuar usando o NextStock.');
    expect(script).toContain('Peça a um administrador da empresa para escolher um plano e concluir a assinatura.');
    expect(script).not.toContain('trialEndsAt < new Date');
  });

  it('envia suporte Dev somente quando branch e modo conferem', () => {
    expect(script).toContain('support?.branchId === state.selectedBranch?.id');
    expect(script).toContain('support?.mode === "support"');
    expect(script).toContain('"x-nextstock-dev-context"');
  });
});
