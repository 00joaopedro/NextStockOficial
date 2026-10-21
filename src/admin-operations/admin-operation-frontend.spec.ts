import { readFileSync } from 'fs';
import { join } from 'path';

describe('administrative operation confirmations', () => {
  it('requires explicit confirmation and sends an idempotency key from both exposed UIs', () => {
    const root = join(__dirname, '..', '..');
    const promotion = readFileSync(join(root, 'public/Js/promocao-admin.js'), 'utf8');
    const fiscal = readFileSync(join(root, 'public/Js/ntfe.js'), 'utf8');

    expect(promotion).toContain('ENCERRAR PROMOÇÃO');
    expect(promotion).toContain("'Idempotency-Key': body.idempotencyKey");
    expect(fiscal).toContain('REMOVER CERTIFICADO');
    expect(fiscal).toContain("'Idempotency-Key': crypto.randomUUID()");
  });
});
