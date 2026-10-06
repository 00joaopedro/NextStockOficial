import { Buffer } from 'node:buffer';

export type PaperWidthMm = 58 | 80;
export type EscPosCodePage = 'cp850' | 'cp858';

const ESC = 0x1b;
const GS = 0x1d;

const CODE_PAGE_COMMANDS: Record<EscPosCodePage, number> = {
  cp850: 2,
  cp858: 19,
};

const CP858_BYTES: Record<string, number> = {
  'Ç': 0x80,
  'ü': 0x81,
  'é': 0x82,
  'â': 0x83,
  'ä': 0x84,
  'à': 0x85,
  'å': 0x86,
  'ç': 0x87,
  'ê': 0x88,
  'ë': 0x89,
  'è': 0x8a,
  'ï': 0x8b,
  'î': 0x8c,
  'ì': 0x8d,
  'Ä': 0x8e,
  'Å': 0x8f,
  'É': 0x90,
  'æ': 0x91,
  'Æ': 0x92,
  'ô': 0x93,
  'ö': 0x94,
  'ò': 0x95,
  'û': 0x96,
  'ù': 0x97,
  'ÿ': 0x98,
  'Ö': 0x99,
  'Ü': 0x9a,
  'ø': 0x9b,
  '£': 0x9c,
  'Ø': 0x9d,
  '×': 0x9e,
  'á': 0xa0,
  'í': 0xa1,
  'ó': 0xa2,
  'ú': 0xa3,
  'ñ': 0xa4,
  'Ñ': 0xa5,
  'ª': 0xa6,
  'º': 0xa7,
  '¿': 0xa8,
  '½': 0xab,
  '¼': 0xac,
  '¡': 0xad,
  '«': 0xae,
  '»': 0xaf,
  'Á': 0xb5,
  'Â': 0xb6,
  'À': 0xb7,
  'Ã': 0xc7,
  'ã': 0xc6,
  'Ê': 0xd2,
  'Í': 0xd6,
  '€': 0xd5,
  'Ô': 0xe2,
  'Õ': 0xe5,
};

const ENTITY_NAMES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

export function columnsFor(width: PaperWidthMm): number {
  return width === 58 ? 32 : 48;
}

export function displayWidth(value: string): number {
  let width = 0;
  for (const character of Array.from(value)) {
    const codePoint = character.codePointAt(0) || 0;
    if (codePoint >= 0x300 && codePoint <= 0x36f) continue;
    width +=
      codePoint >= 0x1100 &&
      (codePoint <= 0x115f ||
        codePoint === 0x2329 ||
        codePoint === 0x232a ||
        (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
        (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
        (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
        (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
        (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
        (codePoint >= 0xff00 && codePoint <= 0xff60) ||
        (codePoint >= 0xffe0 && codePoint <= 0xffe6))
        ? 2
        : 1;
  }
  return width;
}

function takeColumns(value: string, width: number): [string, string] {
  let used = 0;
  let offset = 0;
  for (const character of Array.from(value)) {
    const characterWidth = displayWidth(character);
    if (used + characterWidth > width) break;
    used += characterWidth;
    offset += character.length;
  }
  return [value.slice(0, offset), value.slice(offset)];
}

export function wrapText(value: string, width: number): string[] {
  const words = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    let remaining = word;
    while (displayWidth(remaining) > width) {
      const [part, rest] = takeColumns(remaining, width);
      if (part) lines.push(current ? `${current} ${part}` : part);
      current = '';
      remaining = rest;
    }
    if (!remaining) continue;
    const next = current ? `${current} ${remaining}` : remaining;
    if (displayWidth(next) > width) {
      if (current) lines.push(current);
      current = remaining;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (entity, token: string) => {
      if (token.toLowerCase().startsWith('#x')) {
        return String.fromCodePoint(parseInt(token.slice(2), 16));
      }
      if (token.startsWith('#')) {
        return String.fromCodePoint(parseInt(token.slice(1), 10));
      }
      return ENTITY_NAMES[token.toLowerCase()] || entity;
    },
  );
}

export function htmlToReceiptText(html: string, width: PaperWidthMm): string {
  const columns = columnsFor(width);
  const source = decodeHtmlEntities(
    String(html || '')
      .replace(/<style[\\s\\S]*?<\\/style>/gi, '')
      .replace(/<script[\\s\\S]*?<\\/script>/gi, '')
      .replace(/<br\\s*\\/?\\s*>/gi, '\\n')
      .replace(/<\\/(?:td|th|span)>/gi, ' ')
      .replace(/<\\/p>|<\\/div>|<\\/section>|<\\/tr>|<\\/h[1-6]>/gi, '\\n')
      .replace(/<[^>]+>/g, ''),
  );
  return source
    .split(/\\r?\\n/)
    .flatMap((line) => wrapText(line.replace(/\\s+/g, ' ').trim(), columns))
    .join('\\n')
    .replace(/\\n{3,}/g, '\\n\\n')
    .trim();
}

export function encodeEscPosText(
  text: string,
  codePage: EscPosCodePage = 'cp858',
): Buffer {
  const bytes: number[] = [];
  for (const character of text) {
    if (character === '\\n' || character === '\\r' || character === '\\t') {
      bytes.push(character.charCodeAt(0));
      continue;
    }
    const codePoint = character.codePointAt(0) || 0;
    const encoded =
      codePoint <= 0x7f ? codePoint : CP858_BYTES[character] ?? 0x3f;
    bytes.push(codePage === 'cp850' && character === '€' ? 0x3f : encoded);
  }
  return Buffer.from(bytes);
}

export function encodeEscPos(
  text: string,
  width: PaperWidthMm,
  codePage: EscPosCodePage = 'cp858',
): Buffer {
  const header = Buffer.from([
    ESC,
    0x40,
    ESC,
    0x74,
    CODE_PAGE_COMMANDS[codePage],
    ESC,
    0x61,
    0x01,
  ]);
  const body = Buffer.concat([encodeEscPosText(text, codePage), Buffer.from('\\n\\n')]);
  const footer = Buffer.from([ESC, 0x64, 0x03, GS, 0x56, 0x00]);
  void width;
  return Buffer.concat([header, body, footer]);
}
