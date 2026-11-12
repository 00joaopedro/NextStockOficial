import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { ModuleKind, transpileModule } from 'typescript';

const compile = (file: string) =>
  transpileModule(
    readFileSync(join(process.cwd(), 'public', 'Js', file), 'utf8'),
    { compilerOptions: { module: ModuleKind.CommonJS } },
  ).outputText;
const sessionScript = compile('session-state.ts');
const sidebarScript = compile('sidebar.ts');

function browser(search: string, entries: Record<string, string> = {}) {
  const storage = new Map(Object.entries(entries));
  const network = jest.fn(async (url: string) =>
    url === '/api/billing/subscription'
      ? new Response(JSON.stringify({ code: 'BILLING_ACCESS_REQUIRED' }), {
          status: 402,
        })
      : new Response(null, { status: 401 }),
  );
  const sidebar = { innerHTML: '', querySelector: () => null };
  const listeners = new Map<string, () => Promise<void>>();
  const document = {
    readyState: 'loading',
    addEventListener: (name: string, handler: () => Promise<void>) =>
      listeners.set(name, handler),
    getElementById: (id: string) =>
      id === 'sidebar-container' ? sidebar : null,
    createElement: () => ({}),
    head: { appendChild: () => undefined },
    querySelectorAll: () => [],
    documentElement: { dataset: {} },
  };
  const pathname = search.includes('petshop')
    ? '/agendaPet.html'
    : '/produtos.html';
  const location = {
    search,
    pathname,
    origin: 'https://nextstock.test',
    href: pathname + search,
  };
  const window = {
    fetch: network as typeof fetch,
    location,
    addEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
    setTimeout,
    clearTimeout,
  };
  const env = {
    window,
    document,
    Response,
    Request,
    URL,
    URLSearchParams,
    AbortController,
    CustomEvent: class {},
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      length: 0,
    },
    localStorage: { length: 0 },
    exports: {},
    require: () => ({ installMobileNavigation: () => undefined }),
    fetch: window.fetch,
  };
  runInNewContext(sessionScript, env);
  env.fetch = window.fetch;
  return { env, window, location, sidebar, storage, network, listeners };
}

describe('Public preview navigation', () => {
  it.each(['padrao', 'petshop'])(
    'opens %s without requesting an account or subscription',
    async (mode) => {
      const page = browser(`?systemType=${mode}&mode=preview`, {
        nextstockSelectedSystemType: mode === 'padrao' ? 'petshop' : 'padrao',
      });
      runInNewContext(sidebarScript, page.env);
      await page.listeners.get('DOMContentLoaded')!();

      expect(page.network).not.toHaveBeenCalled();
      expect(page.sidebar.innerHTML).toContain('VISUALIZAÇÃO');
      expect(page.sidebar.innerHTML.includes('agendaPet.html')).toBe(
        mode === 'petshop',
      );
      expect(page.storage.get('nextstockSelectedSystemType')).toBe(mode);

      // Following a sidebar link removes the query string; the selected mode survives.
      page.location.search = '';
      await page.listeners.get('DOMContentLoaded')!();
      expect(page.sidebar.innerHTML.includes('agendaPet.html')).toBe(
        mode === 'petshop',
      );
      expect(page.network).not.toHaveBeenCalled();
    },
  );

  it('keeps preview state after 401 or 402 and blocks writes before the network', async () => {
    const { window, location, network, storage } = browser('', {
      nextstockIsPreview: 'true',
      nextstockSelectedSystemType: 'petshop',
    });
    expect((await window.fetch('/api/auth/profile')).status).toBe(401);
    expect((await window.fetch('/api/billing/subscription')).status).toBe(402);
    const write = await window.fetch('/api/products', { method: 'POST' });
    expect(write.status).toBe(403);
    expect((await write.json()).code).toBe('PREVIEW_MODE_MUTATION_BLOCKED');
    expect(network.mock.calls.map(([url]) => url)).toEqual([
      '/api/auth/profile',
      '/api/billing/subscription',
    ]);
    expect(storage.get('nextstockSelectedSystemType')).toBe('petshop');
    expect(location.href).toBe('/produtos.html');
  });

  it('still renews and redirects an expired authenticated session', async () => {
    const { window, location, network, storage } = browser('', {
      nextstockAuthenticatedUser: '{"id":"real"}',
      nextstockIsPreview: 'true',
    });
    expect((await window.fetch('/api/auth/profile')).status).toBe(401);
    expect(network.mock.calls.map(([url]) => url)).toEqual([
      '/api/auth/profile',
      '/api/auth/session/refresh',
    ]);
    expect(storage.has('nextstockAuthenticatedUser')).toBe(false);
    expect(location.href).toBe('/index.html?auth_error=session_expired');
  });
});
