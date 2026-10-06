import {
  columnsFor,
  displayWidth,
  encodeEscPos,
  htmlToReceiptText,
} from '../../scripts/printing/escpos';

describe('ESC/POS receipt compatibility', () => {
  it('encodes Portuguese accents and common special characters', () => {
    const text = htmlToReceiptText(
      '<p>Preço: R$ 10,00 — café &amp; pão €</p>',
      80,
    );
    const payload = encodeEscPos(text, 80, 'cp858');

    expect(text).toContain('Preço');
    expect(text).toContain('café & pão');
    expect(payload.subarray(0, 8)).toEqual(
      Buffer.from([0x1b, 0x40, 0x1b, 0x74, 0x13, 0x1b, 0x61, 0x01]),
    );
    expect(payload).toContain(0xc6);
    expect(payload).toContain(0x82);
    expect(payload).toContain(0x87);
    expect(payload).toContain(0xd5);
  });

  it('wraps text according to 58 mm and 80 mm printable columns', () => {
    const receipt = '<p>Produto com descrição muito longa para validar a largura</p>';
    const narrow = htmlToReceiptText(receipt, 58).split('\n');
    const wide = htmlToReceiptText(receipt, 80).split('\n');

    expect(columnsFor(58)).toBe(32);
    expect(columnsFor(80)).toBe(48);
    expect(narrow.every((line) => displayWidth(line) <= 32)).toBe(true);
    expect(wide.every((line) => displayWidth(line) <= 48)).toBe(true);
    expect(narrow.length).toBeGreaterThanOrEqual(wide.length);
  });

  it('decodes numeric and named HTML entities without losing symbols', () => {
    expect(htmlToReceiptText('<p>&#199; &Aacute; &#x20AC; &quot;ok&quot;</p>', 58)).toBe(
      'Ç Á € "ok"',
    );
  });

  it('emits feed and full-cut commands at the end of the receipt', () => {
    const payload = encodeEscPos('Teste', 58);
    expect(payload.subarray(-6)).toEqual(
      Buffer.from([0x1b, 0x64, 0x03, 0x1d, 0x56, 0x00]),
    );
  });
});
