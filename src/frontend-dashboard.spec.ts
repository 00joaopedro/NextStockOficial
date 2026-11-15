import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

const publicDir = join(__dirname, '..', 'public');
const html = readFileSync(join(publicDir, 'dashboard.html'), 'utf8');
const script = readFileSync(
  join(publicDir, 'dist/dashboard.js'),
  'utf8',
).replace(/export \{\};\s*$/, '');

class Element extends EventTarget {
  children: Element[] = [];
  textContent = '';
  value = '';
  hidden = false;
  disabled = false;
  dataset: Record<string, string> = {};

  append(...children: Element[]) {
    this.children.push(...children);
  }

  replaceChildren(...children: Element[]) {
    this.children = children;
    this.textContent = '';
  }

  insertCell() {
    const cell = new Element();
    this.append(cell);
    return cell;
  }

  setAttribute() {}
  focus() {}
}

const bundle = {
  summary: {
    grossRevenueCents: 12500,
    totalExpensesCents: 3000,
    grossProfitCents: 7000,
    netProfitCents: 4000,
    averageTicketCents: 6250,
    permissions: { canSeeFinancial: true },
  },
  charts: {
    labels: ['2026-11-15'],
    revenues: [12500],
    expenses: [3000],
    net: [9500],
  },
  topProducts: {
    items: [
      {
        productId: 'product-a',
        productName: 'Produto A',
        quantitySold: 2,
        revenueCents: 12500,
        grossProfitCents: 7000,
      },
    ],
  },
  alerts: {
    upcomingExpenses: [
      {
        name: 'Fornecedor A',
        totalCents: 3000,
        dueDate: '2026-11-15T00:00:00.000Z',
      },
    ],
    upcomingAppointments: [],
    petshopEnabled: false,
  },
};
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const ok = (body: unknown) => ({ ok: true, json: async () => body });

async function setup(options: { demo?: boolean; chartFails?: boolean } = {}) {
  const elements = new Map(
    Array.from(html.matchAll(/\bid="([^"]+)"/g), ([, id]) => [
      id,
      new Element(),
    ]),
  );
  const get = (id: string) => elements.get(id)!;
  get('time-range').value = 'currentMonth';
  get('status-mode').value = 'confirmed';
  const fetch = jest.fn(async (url: string, _options?: RequestInit) => {
    if (url.startsWith('/api/dashboard/products?')) {
      return ok({
        products: [{ id: 'out-of-stock', name: 'Produto sem estoque' }],
      });
    }
    if (url.startsWith('/api/dashboard/product/')) {
      return {
        ok: false,
        json: async () => ({ message: 'Produto indisponível.' }),
      };
    }
    return ok(bundle);
  });
  const window = Object.assign(new EventTarget(), {
    setTimeout: (callback: () => void) => setTimeout(callback, 0),
    clearTimeout,
    isNextStockDemoMode: () => options.demo === true,
  });
  const ApexCharts = options.chartFails
    ? class {
        render() {
          return Promise.reject(new Error('chart error'));
        }
        destroy() {}
      }
    : undefined;

  runInNewContext(script, {
    document: { getElementById: get, createElement: () => new Element() },
    sessionStorage: {
      getItem: (key: string) =>
        ({
          nextstockBranchId: 'branch-a',
          nextstockDevSupportContext:
            '{"branchId":"branch-a","mode":"support"}',
        })[key] ?? null,
    },
    URLSearchParams,
    AbortController,
    window,
    fetch,
    ApexCharts,
  });
  await settle();
  return { fetch, get };
}

describe('Dashboard frontend', () => {
  it('does not block the sidebar on the chart library', () => {
    expect(html).toMatch(
      /<script type="module" src="\.\/dist\/sidebar\.js"><\/script>/,
    );
    expect(html).toMatch(
      /<script[^>]+src="[^"]*\/apexcharts" async><\/script>/,
    );
    expect(html).toContain('linear-gradient(135deg, #0d1b2a, #00cfcf)');
  });

  it.each([false, true])(
    'shows cards, products, alerts and cashflow if the chart is unavailable (%s)',
    async (chartFails) => {
      const { get, fetch } = await setup({ chartFails });
      expect(fetch).toHaveBeenCalledWith(
        '/api/dashboard?preset=currentMonth&statusMode=confirmed',
        {
          headers: {
            Accept: 'application/json',
            'x-nextstock-branch-id': 'branch-a',
            'x-nextstock-dev-context': 'support',
          },
          signal: undefined,
        },
      );
      expect(get('total-revenue').textContent).toMatch(/125,00/);
      expect(
        get('products-table-body').children[0].children[0].textContent,
      ).toBe('Produto A');
      expect(get('upcoming-expenses').children[0].textContent).toContain(
        'Fornecedor A',
      );
      expect(get('chart').hidden).toBe(true);
      expect(get('chart-fallback').hidden).toBe(false);
      expect(get('cashflow-body').children[0].children[0].textContent).toBe(
        '15/11/2026',
      );
    },
  );

  it('validates dates, searches the branch catalogue and keeps the dashboard if product metrics fail', async () => {
    const { get, fetch } = await setup();
    get('time-range').value = 'custom';
    get('apply-filters').dispatchEvent(new Event('click'));
    expect(get('dashboard-state').dataset.kind).toBe('error');
    expect(fetch).toHaveBeenCalledTimes(1);

    get('custom-from').value = '2026-11-15';
    get('custom-to').value = '2026-11-15';
    get('apply-filters').dispatchEvent(new Event('click'));
    await settle();

    get('product-search').value = 'produto';
    get('product-search').dispatchEvent(new Event('input'));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    expect(fetch.mock.calls[2][0]).toBe(
      '/api/dashboard/products?search=produto',
    );

    get('product-autocomplete').children[0].dispatchEvent(new Event('click'));
    await settle();
    expect(fetch.mock.calls[3][0]).toBe(
      '/api/dashboard/product/out-of-stock?preset=custom&statusMode=confirmed&from=2026-11-15&to=2026-11-15',
    );
    expect(get('product-metrics').textContent).toBe('Produto indisponível.');
    expect(get('total-revenue').textContent).toMatch(/125,00/);
    expect(get('dashboard-state').textContent).toBe('Dashboard atualizado.');
    get('clear-product').dispatchEvent(new Event('click'));
    expect(get('product-metrics').textContent).toMatch(/^Selecione um produto/);
  });

  it('keeps the public demo independent from production endpoints', async () => {
    const { get, fetch } = await setup({ demo: true });
    expect(get('apply-filters').disabled).toBe(true);
    get('apply-filters').dispatchEvent(new Event('click'));
    await settle();
    expect(fetch).not.toHaveBeenCalled();
  });
});
