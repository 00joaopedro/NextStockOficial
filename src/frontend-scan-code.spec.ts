import { readFileSync } from 'fs';
import { join } from 'path';
import { runInNewContext } from 'vm';

describe('frontend scan code integration', () => {
  const helperSource = readFileSync(
    join(process.cwd(), 'public', 'Js', 'scan-code.js'),
    'utf8',
  );
  const cadastro = readFileSync(
    join(process.cwd(), 'public', 'cadastro.html'),
    'utf8',
  );

  function helper() {
    const window: Record<string, unknown> = {};
    runInNewContext(helperSource, { window });
    return window.NextStockScanCode as {
      MAX_LENGTH: number;
      normalize(value: unknown): string;
    };
  }

  it('preserva URL, JSON e caracteres especiais sem executar conteudo', () => {
    const scan = helper();
    const value = '{"code":"ABC/10?x=1&next=%2F","path":"C:\\\\item"}\r\n';

    expect(scan.normalize(value)).toBe(
      '{"code":"ABC/10?x=1&next=%2F","path":"C:\\\\item"}',
    );
    expect(scan.MAX_LENGTH).toBe(512);
  });

  it('remove controles terminais e rejeita payload acima do limite', () => {
    const scan = helper();

    expect(scan.normalize('\u0000EAN-123\t\r\n')).toBe('EAN-123');
    expect(() => scan.normalize('x'.repeat(513))).toThrow(
      'no maximo 512 caracteres',
    );
  });

  it('cadastro preserva codigo 2D e confirma leitores com Enter ou Tab', () => {
    expect(cadastro).toContain('id="codigoBarra"');
    expect(cadastro).toContain('maxlength="512"');
    expect(cadastro).toContain('./Js/scan-code.js');
    expect(cadastro).toContain('if (campo.id === "codigoBarra") return');
    expect(cadastro).toContain('normalizarCodigoEscaneavel');
    expect(cadastro).toContain('["Enter", "Tab"].includes(event.key)');
  });
});
