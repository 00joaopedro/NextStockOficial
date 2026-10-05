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

const root = join(__dirname, '..');

describe('clientePet.html production wiring', () => {
  const html = pageSource(root, 'clientePet.html');
  const script = readFileSync(
    join(root, 'public', 'Js', 'clientePet.js'),
    'utf8',
  );

  it('carrega apenas o script real, sem o mock legado duplicado', () => {
    expect(html).not.toContain('csp-extracted/clientePet-inline1.js');
    expect(html).toContain('./Js/clientePet.js');
  });

  it('usa APIs reais de clientes, pets, agenda e upload multipart', () => {
    expect(script).toContain('/api/auth/profile');
    expect(script).toContain('/api/system/context');
    expect(script).toContain('/api/pet-clients');
    expect(script).toContain('/api/pets/${petId}/photos');
    expect(script).toContain('new FormData()');
  });

  it('protege mutacoes contra duplicidade e informa o estado da operacao', () => {
    expect(script).toContain('let mutationInFlight = false;');
    expect(script).toContain("showAlertPopup('Processando', loading, false)");
    expect(script).toContain("button.setAttribute('aria-busy'");
    expect(script).toContain("loading: 'Criando perfil do cliente...'");
    expect(script).toContain("loading: 'Apagando perfil do cliente...'");
    expect(script).toContain('Criando perfil do animal...');
    expect(script).toContain('Apagando perfil do animal...');
  });

  it('bloqueia modo padrao e escrita em visualizacao no frontend', () => {
    expect(script).toContain("systemType !== 'petshop'");
    expect(script).toContain('Modo visualizacao: alteracao bloqueada.');
    expect(script).toContain('ensureCanWrite');
  });

  it('valida filial Pet Shop real antes de carregar clientes', () => {
    expect(script).toContain('function resolvePetShopBranch');
    expect(script).toContain("realStoredBranch?.systemType === 'petshop'");
    expect(script).toContain("selectedBranch.systemType !== 'petshop'");
    expect(script).toContain("'x-nextstock-branch-id'");
  });
});
