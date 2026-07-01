import { readFileSync } from 'fs';
import { join } from 'path';

describe('ntfe.html production fiscal integration', () => {
  const html = readFileSync(join(process.cwd(), 'public', 'ntfe.html'), 'utf8');
  const script = readFileSync(
    join(process.cwd(), 'public', 'Js', 'ntfe.js'),
    'utf8',
  );

  it('desativa o script legado e carrega o frontend fiscal real', () => {
    expect(html).toContain('data-legacy-fiscal-script="disabled"');
    expect(html).toContain('./Js/ntfe.js');
    expect(script).not.toContain('DEMO_CLIENTS');
  });

  it('valida profile e contexto antes de carregar o rascunho', () => {
    expect(script).toContain('/api/auth/profile');
    expect(script).toContain('/api/system/context');
    expect(script).toContain('x-nextstock-branch-id');
  });

  it('suporta orderId, saleId e documentId pelo backend fiscal', () => {
    expect(script).toContain("params.get('orderId')");
    expect(script).toContain("params.get('saleId')");
    expect(script).toContain("params.get('documentId')");
    expect(script).toContain('/api/fiscal/nfe55/draft?');
    expect(script).toContain('/api/fiscal/documents/');
  });

  it('nao usa innerHTML para dados fiscais dinamicos', () => {
    expect(script).not.toContain('.innerHTML');
    expect(script).toContain('textContent');
    expect(script).toContain('replaceChildren');
  });

  it('nao apresenta autorizacao falsa quando o provider nao autoriza', () => {
    expect(script).toContain('result.authorized');
    expect(script).toContain('result.message');
    expect(script).not.toContain('alert("Frontend pronto');
  });

  it('configura certificado via FormData sem definir Content-Type manualmente', () => {
    expect(html).toContain('id="certificateFile"');
    expect(html).toContain('id="certificatePassword"');
    expect(script).toContain("formData.append('file', file)");
    expect(script).toContain(
      "formData.append('password', elements.certificatePassword.value)",
    );
    expect(script).toContain('options?.body instanceof FormData');
    expect(script).toContain("elements.certificatePassword.value = ''");
    expect(script).not.toContain('localStorage.setItem');
  });

  it('mostra ambiente somente leitura e nao envia tpAmb', () => {
    expect(html).toContain('class="environment-badge"');
    expect(html).not.toContain('<select id="ambiente">');
    expect(script).toContain("production ? 'PRODUÇÃO (tpAmb=1)'");
    expect(script).not.toContain('tpAmb:');
  });

  it('restringe controles do certificado a administrador e usa textContent', () => {
    expect(html).toContain('id="fiscalAdminPanel" hidden');
    expect(script).toContain('elements.adminPanel.hidden = !isAdmin()');
    expect(script).toContain('certificateActionStatus.textContent');
    expect(script).not.toContain('.innerHTML');
  });
});
