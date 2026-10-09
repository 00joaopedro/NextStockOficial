import {
  DEFAULT_SCALE_BARCODE_FORMAT,
  parseScaleBarcode,
} from './scale-barcode.util';

describe('scale-barcode.util', () => {
  it('interpreta etiqueta EAN-13 real com peso', () => {
    const result = parseScaleBarcode('2001234500012');

    expect(result.kind).toBe('label');
    if (result.kind !== 'label') return;
    expect(result.label.productCode).toBe('001234');
    expect(result.label.quantity).toBe(50.001);
    expect(result.label.format).toEqual(DEFAULT_SCALE_BARCODE_FORMAT);
  });

  it('interpreta etiqueta configurada por valor total', () => {
    const result = parseScaleBarcode('9901234567890', {
      formats: [
        {
          ...DEFAULT_SCALE_BARCODE_FORMAT,
          prefix: '99',
          payloadType: 'value',
          payloadStart: 7,
          payloadLength: 5,
          decimals: 2,
        },
      ],
    });

    expect(result.kind).toBe('label');
    if (result.kind !== 'label') return;
    expect(result.label.productCode).toBe('012345');
    expect(result.label.payloadCents).toBe(6789);
  });

  it('rejeita dígito verificador inválido', () => {
    const result = parseScaleBarcode('2001234500013');

    expect(result).toEqual({
      kind: 'invalid',
      message: 'Etiqueta inválida: dígito verificador incorreto.',
    });
  });

  it('não trata código comum como etiqueta', () => {
    expect(parseScaleBarcode('7891234567890').kind).toBe('not-label');
  });

  it('permite desativar o formato padrão', () => {
    expect(
      parseScaleBarcode('2001234500012', { enabled: false }).kind,
    ).toBe('not-label');
  });
});
