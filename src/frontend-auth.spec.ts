import { readFileSync } from 'fs';
import { join } from 'path';

describe('frontend auth pages', () => {
  const publicFile = (file: string) =>
    readFileSync(join(__dirname, '..', 'public', file), 'utf8');

  it('index.html nao possui selecao manual de filial no login', () => {
    const html = publicFile('index.html');

    expect(html).not.toContain('login' + 'Branch');
    expect(html).not.toContain('branchSelection' + 'Panel');
    expect(html).not.toContain('requires' + 'BranchSelection');
    expect(html).not.toContain('agora selecione' + ' a sua filial');
  });

  it('dev.html abre sistema em production sem definir preview', () => {
    const html = publicFile('dev.html');

    expect(html).toContain("sessionStorage.setItem('nextstockBackendMode', 'production')");
    expect(html).toContain("sessionStorage.setItem('nextstockSelectedSystemType', selectedType)");
    expect(html).toContain('clientePet.html?systemType=petshop&mode=production');
    expect(html).toContain('produtos.html?systemType=padrao&mode=production');
    expect(html).not.toContain("sessionStorage.setItem('nextstockPreviewMode'");
    expect(html).not.toContain("sessionStorage.setItem('nextstockIsPreview'");
  });
});
