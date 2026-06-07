import { readFileSync } from 'fs';
import { join } from 'path';

function publicFile(path: string) {
  return readFileSync(join(__dirname, '..', 'public', path), 'utf8');
}

describe('agendaPet frontend production flow', () => {
  it('carrega script real e nao executa mock inline em production', () => {
    const html = publicFile('agendaPet.html');

    expect(html).toContain('src="./dist/agendaPet.js"');
    expect(html).toContain('id="legacy-agenda-demo-disabled"');
    expect(html).not.toContain('<script>\n    function isDemoMode()');
  });

  it('script real valida contexto e usa API da agenda', () => {
    const script = publicFile('Js/agendaPet.ts');

    expect(script).toContain('/api/auth/profile');
    expect(script).toContain('/api/system/context');
    expect(script).toContain('/api/agenda-pet');
    expect(script).toContain('tenantType !== "PETSHOP"');
    expect(script).toContain('Modo visualizacao: alteracao bloqueada.');
    expect(script).not.toContain('DEMO_ATENDIMENTOS');
  });

  it('clientePet usa a agenda principal como fonte do historico', () => {
    const html = publicFile('clientePet.html');
    const script = publicFile('Js/clientePet.js');
    const helper = publicFile('Js/agenda-utils.js');

    expect(html).toContain('src="./Js/agenda-utils.js"');
    expect(script).toContain('/api/agenda-pet?');
    expect(script).toContain('clientId: cliente.id');
    expect(script).not.toContain('/api/pet-clients/${cliente.id}/appointments');
    expect(script).toContain('response.items || response.data || []');
    expect(script).toContain('statusLabel');
    expect(helper).toContain('normalizeAppointment');
    expect(helper).toContain('canceled:');
    expect(helper).toContain('completed:');
  });
});
