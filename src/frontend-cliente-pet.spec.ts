import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..');

describe('clientePet.html production wiring', () => {
  const html = readFileSync(join(root, 'public', 'clientePet.html'), 'utf8');
  const script = readFileSync(join(root, 'public', 'Js', 'clientePet.js'), 'utf8');

  it('nao executa mais o script mockado inline como fonte principal', () => {
    expect(html).toContain('id="legacy-cliente-pet-script"');
    expect(html).toContain('type="application/json"');
    expect(html).toContain('./Js/clientePet.js');
  });

  it('usa APIs reais de clientes, pets, agenda e upload multipart', () => {
    expect(script).toContain('/api/auth/profile');
    expect(script).toContain('/api/system/context');
    expect(script).toContain('/api/pet-clients');
    expect(script).toContain('/api/pets/${petId}/photos');
    expect(script).toContain('new FormData()');
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
