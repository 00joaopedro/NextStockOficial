import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

function pageSource(root: string, file: string) {
  const html = readFileSync(join(root, 'public', file), 'utf8');
  const extracted = file.replace(/\.html$/, '-inline1.js');
  try {
    return `${html}\n${readFileSync(join(root, 'public', 'Js', 'csp-extracted', extracted), 'utf8')}`;
  } catch {
    return html;
  }
}

const publicDir = join(__dirname, '..', 'public');

function publicFile(path: string) {
  return readFileSync(join(publicDir, path), 'utf8');
}

describe('frontend CSP compatibility', () => {
  it('does not leave executable inline scripts or inline event handlers in HTML pages', () => {
    const htmlFiles = readdirSync(publicDir).filter((file) =>
      file.endsWith('.html'),
    );

    for (const file of htmlFiles) {
      const html = publicFile(file);
      expect(html).not.toMatch(
        /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i,
      );
      expect(html).not.toMatch(/\son[a-zA-Z]+\s*=/);
      expect(html).not.toMatch(/javascript:/i);
    }
  });

  it('enforces script-src without unsafe-inline or unsafe-eval by default', () => {
    const main = readFileSync(join(__dirname, 'main.ts'), 'utf8');

    expect(main).toContain('reportOnly: isCspReportOnly()');
    expect(main).toContain(
      "scriptSrc: [\"'self'\", 'https://cdn.jsdelivr.net']",
    );
    expect(main).not.toMatch(/scriptSrc:\s*\[[^\]]*unsafe-inline/);
    expect(main).not.toMatch(/scriptSrc:\s*\[[^\]]*unsafe-eval/);
    expect(main).toContain('objectSrc: ["\'none\'"]');
    expect(main).toContain('frameAncestors: ["\'none\'"]');
  });
});
