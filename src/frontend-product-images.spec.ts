import { readFileSync } from 'fs';
import { join } from 'path';

function publicFile(path: string) {
  return readFileSync(join(__dirname, '..', 'public', path), 'utf8');
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
    expect(html).toContain("onerror=\"this.onerror=null;this.src='${productImageFallback()}'\"");
    expect(html).not.toContain('image.fileUrl || image.storagePath || image.fileName');
  });
});
