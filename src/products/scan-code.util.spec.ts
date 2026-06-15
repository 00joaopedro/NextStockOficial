import { BadRequestException } from '@nestjs/common';
import {
  extractScanCodeCandidates,
  MAX_SCAN_CODE_LENGTH,
  normalizeScanCode,
} from './scan-code.util';

describe('scan-code.util', () => {
  it('normaliza Unicode e remove somente controles terminais do leitor', () => {
    expect(normalizeScanCode('\u0000Cafe\u0301%?={}\\\t\r\n')).toBe(
      'Café%?={}\\',
    );
  });

  it('extrai identificadores permitidos de JSON antes do payload bruto', () => {
    const raw = '{"barcode":"7891234567890","sku":"SKU-10","html":"<script>"}';

    expect(extractScanCodeCandidates(raw)).toEqual([
      '7891234567890',
      'SKU-10',
      raw,
    ]);
  });

  it('extrai identificadores permitidos de URL sem navegar', () => {
    const raw =
      'https://example.test/product?barcode=7891234567890&sku=SKU%2F20';

    expect(extractScanCodeCandidates(raw)).toEqual([
      '7891234567890',
      'SKU/20',
      raw,
    ]);
  });

  it('mantem conteudo 2D desconhecido como candidato bruto', () => {
    expect(extractScanCodeCandidates('DATA-MATRIX:ABC/123?x=1')).toEqual([
      'DATA-MATRIX:ABC/123?x=1',
    ]);
  });

  it('rejeita codigo acima do limite sem incluir o payload no erro', () => {
    const raw = 'x'.repeat(MAX_SCAN_CODE_LENGTH + 1);

    expect(() => normalizeScanCode(raw)).toThrow(BadRequestException);
    expect(() => normalizeScanCode(raw)).toThrow('no maximo 512 caracteres');
  });
});
