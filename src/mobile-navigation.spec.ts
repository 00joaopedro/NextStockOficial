import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { transpileModule, ModuleKind } from 'typescript';

describe('shared mobile navigation', () => {
  function fixture(portrait = true) {
    const elements: Element[] = [];
    let active: Element | null = null;
    class Element {
      id = '';
      textContent = '';
      hidden = false;
      inert = false;
      attrs = new Map<string, string>();
      children: Element[] = [];
      events = new Map<string, (event: any) => void>();
      classList = { toggle: jest.fn() };
      constructor() { elements.push(this); }
      append(...children: Element[]) { this.children.push(...children); }
      appendChild(child: Element) { this.children.push(child); }
      prepend(child: Element) { this.children.unshift(child); }
      setAttribute(name: string, value: string) { this.attrs.set(name, value); }
      removeAttribute(name: string) { this.attrs.delete(name); }
      addEventListener(name: string, callback: (event: any) => void) { this.events.set(name, callback); }
      focus() { active = this; }
      getClientRects() { return [{}]; }
      querySelector(selector: string) {
        if (selector === '.sidebar') return sidebar;
        if (selector.startsWith('#')) return this.children.flatMap((e) => [e, ...e.children]).find((e) => e.id === selector.slice(1)) ?? null;
        return null;
      }
      querySelectorAll() { return sidebar.children; }
    }
    const sidebar = new Element();
    const container = new Element(); container.id = 'sidebar-container';
    const body = new Element(), head = new Element();
    const document = {
      body, head, get activeElement() { return active; },
      getElementById: (id: string) => elements.find((e) => e.id === id) ?? null,
      createElement: () => new Element(),
      addEventListener: jest.fn(),
    };
    const media = { matches: portrait, addEventListener: jest.fn() };
    let rerender: () => void = () => undefined;
    const source = readFileSync(join(process.cwd(), 'public/Js/mobile-navigation.ts'), 'utf8');
    const exports: { installMobileNavigation?: () => void } = {};
    runInNewContext(transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText, {
      exports, document, window: { matchMedia: () => media },
      MutationObserver: class { constructor(callback: () => void) { rerender = callback; } observe() {} },
    });
    exports.installMobileNavigation!();
    return { container, sidebar, document, media, elements, rerender,
      toggle: elements.find((e) => e.textContent === '☰ Menu')!,
      backdrop: elements.find((e) => e.id === 'nextstock-mobile-backdrop')! };
  }

  it('opens, closes with Escape and restores focus without changing permissions', () => {
    const f = fixture();
    expect(f.container.inert).toBe(true);
    f.toggle.events.get('click')!({});
    expect(f.container.inert).toBe(false);
    expect(f.container.attrs.get('aria-modal')).toBe('true');
    expect(f.toggle.attrs.get('aria-expanded')).toBe('true');
    const keydown = f.document.addEventListener.mock.calls.find(([name]) => name === 'keydown')![1] as (e: any) => void;
    keydown({ key: 'Escape', preventDefault: jest.fn() });
    expect(f.container.inert).toBe(true);
    expect(f.document.activeElement).toBe(f.toggle);
    expect(f.backdrop.hidden).toBe(true);
  });

  it('clears drawer state on rotation and decorates the menu only once', () => {
    const f = fixture();
    f.toggle.events.get('click')!({});
    f.rerender(); f.rerender();
    expect(f.sidebar.children.filter((e) => e.id === 'nextstock-mobile-close')).toHaveLength(1);
    f.media.matches = false;
    const rotate = f.media.addEventListener.mock.calls[0][1] as () => void;
    rotate();
    expect(f.container.inert).toBe(false);
    expect(f.container.attrs.has('aria-modal')).toBe(false);
    expect(f.backdrop.hidden).toBe(true);
  });
});
