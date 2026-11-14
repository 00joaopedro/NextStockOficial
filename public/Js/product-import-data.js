(function (root) {
  'use strict';
  const limit = 2147483647;
  function number(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    let s = String(value ?? '').trim().replace(/^R\$\s*/, '').replace(/%$/, '').trim();
    if (/^-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d+$/.test(s)) {
      s = s.replace(/\./g, '').replace(',', '.');
    }
    return /^-?\d+(?:\.\d+)?$/.test(s) ? Number(s) : NaN;
  }
  function convert(raw) {
    const name = String(raw.name ?? '').trim();
    const barcode = String(raw.barcode ?? '').normalize('NFC').trim() || null;
    const costPriceCents = Math.round(number(raw.cost) * 100);
    const blank = (v) => String(v ?? '').trim() === '';
    const salePriceCents = !blank(raw.sale) ? Math.round(number(raw.sale) * 100)
      : !blank(raw.profit) ? costPriceCents + Math.round(number(raw.profit) * 100)
        : Math.round(costPriceCents * (1 + number(raw.percent) / 100));
    const quantity = blank(raw.quantity) ? 0 : number(raw.quantity);
    if (!name || name.length > 120) throw new Error('Nome obrigatório (até 120 caracteres).');
    if (barcode && barcode.length > 512) throw new Error('Código de barras muito longo.');
    if (!Number.isInteger(costPriceCents) || number(raw.cost) < 0 || costPriceCents > limit) throw new Error('Custo inválido.');
    if (!Number.isInteger(salePriceCents) || salePriceCents <= 0 || salePriceCents > limit) throw new Error('Preço de venda inválido.');
    if (costPriceCents && Math.round((salePriceCents - costPriceCents) * 10000 / costPriceCents) > 9999999) throw new Error('Acréscimo fora do limite.');
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > limit) throw new Error('Quantidade deve ser um inteiro não negativo.');
    return { name, barcode, costPriceCents, salePriceCents, quantity };
  }
  const api = { convert };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NextStockProductImport = api;
})(globalThis);
