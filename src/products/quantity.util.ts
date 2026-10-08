export const MAX_DECIMAL_QUANTITY = 9999999.999999;
export const MAX_DECIMAL_PLACES = 6;

export function normalizeQuantity(value: unknown, field = 'quantidade') {
  const quantity = typeof value === 'string' && value.trim() !== '' ? Number(value) : Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error(`${field} deve ser um numero maior que zero.`);
  }
  if (quantity > MAX_DECIMAL_QUANTITY) {
    throw new Error(`${field} excede o limite permitido.`);
  }
  const decimals = (String(value).replace(',', '.').split('.')[1] || '').length;
  if (decimals > MAX_DECIMAL_PLACES) {
    throw new Error(`${field} aceita no maximo ${MAX_DECIMAL_PLACES} casas decimais.`);
  }
  return quantity;
}

export function decimalStockValue(value: unknown) {
  return Number(value ?? 0);
}

export function calculateQuantityPriceCents(unitPriceCents: number, quantity: number) {
  return Math.round(unitPriceCents * quantity);
}

export function formatQuantity(value: unknown) {
  return Number(value ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: MAX_DECIMAL_PLACES });
}
