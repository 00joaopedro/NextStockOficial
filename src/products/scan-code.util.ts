import { BadRequestException } from '@nestjs/common';

export const MAX_SCAN_CODE_LENGTH = 512;

const SCAN_CODE_KEYS = [
  'barcode',
  'code',
  'sku',
  'ean',
  'gtin',
  'productCode',
] as const;

export function normalizeScanCode(value: unknown): string {
  if (typeof value !== 'string') return '';

  const normalized = value
    .normalize('NFC')
    .replace(/^[\u0000\t\r\n]+/, '')
    .replace(/[\u0000\t\r\n ]+$/, '');

  if (normalized.length > MAX_SCAN_CODE_LENGTH) {
    throw new BadRequestException(
      `O codigo escaneavel deve ter no maximo ${MAX_SCAN_CODE_LENGTH} caracteres.`,
    );
  }

  return normalized;
}

export function extractScanCodeCandidates(value: unknown): string[] {
  const raw = normalizeScanCode(value);
  if (!raw) return [];

  const extracted: string[] = [];
  extractJsonCandidates(raw, extracted);
  extractUrlCandidates(raw, extracted);

  return uniqueCandidates([...extracted, raw]);
}

function extractJsonCandidates(raw: string, target: string[]) {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;

    const record = parsed as Record<string, unknown>;
    for (const key of SCAN_CODE_KEYS) {
      const candidate = primitiveCandidate(record[key]);
      if (candidate) target.push(candidate);
    }
  } catch {
    // A scan payload is allowed to be plain text.
  }
}

function extractUrlCandidates(raw: string, target: string[]) {
  try {
    const parsed = new URL(raw);
    for (const key of SCAN_CODE_KEYS) {
      const candidate = parsed.searchParams.get(key);
      if (candidate) target.push(candidate);
    }
  } catch {
    // A scan payload is allowed to be something other than a URL.
  }
}

function primitiveCandidate(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return normalizeScanCode(String(value));
}

function uniqueCandidates(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}
