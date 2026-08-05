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

function publicFile(path: string) {
  return pageSource(join(__dirname, '..'), path);
}

describe('Product image upload frontend flow', () => {
  it('cadastro envia arquivos reais via multipart para o endpoint de upload', () => {
    const html = publicFile('cadastro.html');

    expect(html).toContain('new FormData()');
    expect(html).toContain('formData.append("file", imagem.arquivo)');
    expect(html).toContain('/products/${productId}/images/upload');
    expect(html).not.toContain('function enviarMetadadosImagens');
  });

  it('produtos renderiza somente URLs validas e usa fallback', () => {
    const html = publicFile('produtos.html');

    expect(html).toContain('function isRenderableImageUrl');
    expect(html).toContain('image.fileUrl || image.signedUrl || image.url');
    expect(html).toContain('image.addEventListener("error"');
    expect(html).not.toContain(
      'image.fileUrl || image.storagePath || image.fileName',
    );
  });
});
