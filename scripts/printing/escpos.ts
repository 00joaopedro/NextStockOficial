import { Buffer } from 'node:buffer';

export type PaperWidthMm = 58 | 80;

const ESC = 0x1b;
const GS = 0x1d;

export function columnsFor(width: PaperWidthMm) {
  return width === 58 ? 32 : 48;
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
    if (word.length > width) {
      if (current) lines.push(current);
      for (let offset = 0; offset < word.length; offset += width) {
        lines.push(word.slice(offset, offset + width));
      }
      current = '';
      continue;
    }
    const next = current ? `${current} ${word}` : word;
    if (next.length > width) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines;
}

export function htmlToReceiptText(html: string, width: PaperWidthMm): string {
  const columns = columnsFor(width);
  const source = String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:td|th|span)>/gi, ' ')
    .replace(/<\/p>|<\/div>|<\/section>|<\/tr>|<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'");
  return source
    .split(/\r?\n/)
    .flatMap((line) => wrapText(line.replace(/\s+/g, ' ').trim(), columns))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function encodeEscPos(text: string, width: PaperWidthMm): Buffer {
  void width;
  const header = Buffer.from([ESC, 0x40, ESC, 0x61, 0x01]);
  const body = Buffer.from(`${text}\n\n`, 'utf8');
  const footer = Buffer.from([ESC, 0x64, 0x03, GS, 0x56, 0x00]);
  return Buffer.concat([header, body, footer]);
}
