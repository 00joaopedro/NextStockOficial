export type ScaleLabelPayloadType = 'weight' | 'value';

export type ScaleBarcodeFormat = {
  name?: string;
  prefix: string;
  length: number;
  productStart: number;
  productLength: number;
  payloadStart: number;
  payloadLength: number;
  payloadType: ScaleLabelPayloadType;
  decimals: number;
  checkDigit: 'mod10' | 'none';
};

export type ScaleBarcodeConfig = {
  enabled?: boolean;
  formats?: ScaleBarcodeFormat[];
};

export type ParsedScaleLabel = {
  format: ScaleBarcodeFormat;
  raw: string;
  productCode: string;
  payloadRaw: string;
  payload: number;
  payloadCents?: number;
  quantity?: number;
};

export type ScaleLabelParseResult =
  | { kind: 'not-label' }
  | { kind: 'invalid'; message: string }
  | { kind: 'label'; label: ParsedScaleLabel };

export const DEFAULT_SCALE_BARCODE_FORMAT: ScaleBarcodeFormat = {
  name: 'ean13-weight',
  prefix: '2',
  length: 13,
  productStart: 1,
  productLength: 6,
  payloadStart: 7,
  payloadLength: 5,
  payloadType: 'weight',
  decimals: 3,
  checkDigit: 'mod10',
};

export function parseScaleBarcode(
  value: string,
  config?: ScaleBarcodeConfig | null,
): ScaleLabelParseResult {
  const raw = value.trim();
  const formats = resolveScaleBarcodeFormats(config);
  const format = formats.find(
    (candidate) =>
      raw.startsWith(candidate.prefix) && raw.length === candidate.length,
  );

  if (!format) return { kind: 'not-label' };
  if (!/^\d+$/.test(raw)) {
    return { kind: 'invalid', message: 'A etiqueta deve conter apenas dígitos.' };
  }

  if (format.checkDigit === 'mod10' && !hasValidMod10(raw)) {
    return {
      kind: 'invalid',
      message: 'Etiqueta inválida: dígito verificador incorreto.',
    };
  }

  const productCode = raw.slice(
    format.productStart,
    format.productStart + format.productLength,
  );
  const payloadRaw = raw.slice(
    format.payloadStart,
    format.payloadStart + format.payloadLength,
  );
  if (
    productCode.length !== format.productLength ||
    payloadRaw.length !== format.payloadLength
  ) {
    return { kind: 'invalid', message: 'Etiqueta inválida: posições incompletas.' };
  }

  const payload = Number(payloadRaw) / 10 ** format.decimals;
  if (!Number.isFinite(payload) || payload <= 0) {
    return { kind: 'invalid', message: 'Etiqueta inválida: peso/valor zerado.' };
  }

  return {
    kind: 'label',
    label: {
      format,
      raw,
      productCode,
      payloadRaw,
      payload,
      ...(format.payloadType === 'value'
        ? { payloadCents: Math.round(payload * 100) }
        : { quantity: payload }),
    },
  };
}

export function resolveScaleBarcodeFormats(
  config?: ScaleBarcodeConfig | null,
): ScaleBarcodeFormat[] {
  if (config?.enabled === false) return [];
  const configured = Array.isArray(config?.formats) ? config.formats : [];
  return (configured.length ? configured : [DEFAULT_SCALE_BARCODE_FORMAT]).map(
    (format) => ({
      ...DEFAULT_SCALE_BARCODE_FORMAT,
      ...format,
      prefix: String(format.prefix || DEFAULT_SCALE_BARCODE_FORMAT.prefix),
      length: Number(format.length || DEFAULT_SCALE_BARCODE_FORMAT.length),
      productStart: Number(
        format.productStart ?? DEFAULT_SCALE_BARCODE_FORMAT.productStart,
      ),
      productLength: Number(
        format.productLength ?? DEFAULT_SCALE_BARCODE_FORMAT.productLength,
      ),
      payloadStart: Number(
        format.payloadStart ?? DEFAULT_SCALE_BARCODE_FORMAT.payloadStart,
      ),
      payloadLength: Number(
        format.payloadLength ?? DEFAULT_SCALE_BARCODE_FORMAT.payloadLength,
      ),
      decimals: Number(
        format.decimals ?? DEFAULT_SCALE_BARCODE_FORMAT.decimals,
      ),
      checkDigit: format.checkDigit === 'none' ? 'none' : 'mod10',
      payloadType: format.payloadType === 'value' ? 'value' : 'weight',
    }),
  );
}

function hasValidMod10(value: string) {
  const body = value.slice(0, -1);
  const expected = Number(value.at(-1));
  let sum = 0;
  for (let index = body.length - 1, weight = 3; index >= 0; index -= 1) {
    sum += Number(body[index]) * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return (10 - (sum % 10)) % 10 === expected;
}
