import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

const publicDir = join(__dirname, '..', 'public');
const html = readFileSync(join(publicDir, 'produtos.html'), 'utf8');
const source = readFileSync(
  join(publicDir, 'Js/csp-extracted/produtos-inline1.js'),
  'utf8',
);
const productId = '51515151-5151-4515-8515-515151515151';

type Handler = (event: {
  target: Element;
  key?: string;
  stopPropagation(): void;
  preventDefault(): void;
}) => void;

class Element {
  children: Element[] = [];
  parent: Element | null = null;
  id = '';
  className = '';
  textContent = '';
  value = '';
  max = '';
  open = false;
  disabled = false;
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  handlers = new Map<string, Handler[]>();
  classList = {
    contains: (name: string) => this.className.split(' ').includes(name),
    toggle: (name: string, force = !this.classList.contains(name)) => {
      const names = new Set(this.className.split(' ').filter(Boolean));
      if (force) names.add(name);
      else names.delete(name);
      this.className = [...names].join(' ');
    },
    add: (name: string) => this.classList.toggle(name, true),
    remove: (name: string) => this.classList.toggle(name, false),
  };

  constructor(readonly tag = 'div') {}

  get valueAsNumber() {
    return this.value === '' ? NaN : Number(this.value);
  }

  set innerHTML(html: string) {
    this.children = [];
    const stack: Element[] = [this];
    // The script generates ordinary elements with quoted attributes.
    for (const token of html.match(/<[^>]+>|[^<]+/g) ?? []) {
      if (token.startsWith('</')) stack.pop();
      else if (token.startsWith('<')) {
        const [, tag, attributes] = token.match(/^<(\w+)([^>]*)>/) ?? [];
        if (!tag) continue;
        const element = new Element(tag);
        for (const [, key, value] of attributes.matchAll(
          /([\w-]+)(?:="([^"]*)")?/g,
        )) {
          element.setAttribute(key, value ?? '');
        }
        stack.at(-1)!.appendChild(element);
        stack.push(element);
      } else {
        stack.at(-1)!.textContent += token;
      }
    }
  }

  setAttribute(key: string, value: string) {
    this.attributes.set(key, value);
    if (key === 'id') this.id = value;
    if (key === 'class') this.className = value;
    if (key === 'disabled') this.disabled = true;
    if (key === 'data-id') this.dataset.id = value;
    if (key === 'data-action') this.dataset.action = value;
  }

  matches(selector: string): boolean {
    return selector.split(', ').some((part) => {
      if (part.startsWith('.')) return this.classList.contains(part.slice(1));
      if (part.startsWith('#')) return this.id === part.slice(1);
      const [, tag, key, value] =
        part.match(/^(\w+)?\[([\w-]+)(?:='([^']+)')?\]$/) ?? [];
      return (
        !!key &&
        (!tag || tag === this.tag) &&
        this.attributes.has(key) &&
        (value === undefined || this.attributes.get(key) === value)
      );
    });
  }

  querySelector(selector: string): Element | null {
    for (const child of this.children) {
      if (child.matches(selector)) return child;
      const result = child.querySelector(selector);
      if (result) return result;
    }
    return null;
  }

  closest(selector: string): Element | null {
    return this.matches(selector)
      ? this
      : (this.parent?.closest(selector) ?? null);
  }

  contains(element: Element): boolean {
    return (
      this === element || this.children.some((child) => child.contains(element))
    );
  }

  appendChild(child: Element) {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  addEventListener(name: string, handler: Handler) {
    const handlers = this.handlers.get(name) ?? [];
    handlers.push(handler);
    this.handlers.set(name, handlers);
  }

  emit(name: string, target = this, key?: string) {
    let stopped = false;
    const event = {
      target,
      key,
      stopPropagation: () => {
        stopped = true;
      },
      preventDefault: () => undefined,
    };
    for (
      let element: Element | null = this;
      element && !stopped;
      element = element.parent
    ) {
      for (const handler of element.handlers.get(name) ?? []) handler(event);
    }
  }

  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
    this.emit('close');
  }
  focus() {}
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

async function setup(demo = false) {
  const document = new Element();
  const fields = new Map(
    Array.from(html.matchAll(/\bid="([^"]+)"/g), ([, id]) => {
      const element = new Element();
      element.id = id;
      document.appendChild(element);
      return [id, element];
    }),
  );
  const initialButtons = document.appendChild(new Element());
  initialButtons.className = 'initial-order-buttons';
  const get = (id: string) =>
    fields.get(id) ?? document.querySelector('#' + id)!;
  const productionProduct = {
    id: productId,
    nome: 'Abacaxi',
    precoVenda: 11.32,
    quantidade: 3,
  };
  const fetch = jest.fn((url: string) =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve(
          url.startsWith('/api/orders')
            ? { items: [] }
            : {
                products: [productionProduct],
                product: productionProduct,
                total: 1,
                totalPages: 1,
              },
        ),
    }),
  );
  const alert = jest.fn();
  Object.assign(document, {
    getElementById: get,
    createElement: (tag: string) => new Element(tag),
  });

  runInNewContext(source, {
    document,
    window: {
      location: {
        search: demo ? '?mode=preview' : '?mode=production',
        origin: 'https://fixture.test',
      },
    },
    sessionStorage: { getItem: () => null },
    localStorage: { getItem: () => null },
    fetch,
    alert,
    URL,
    URLSearchParams,
    AbortController,
  });
  await settle();
  for (const [field, value] of Object.entries({
    clientEmailInput: 'fixture@example.test',
    clientFullNameInput: 'Cliente de teste',
    clientPhoneInput: '11999999999',
    clientCepInput: '01001000',
    clientStateInput: 'SP',
    clientCityInput: 'São Paulo',
    clientNeighborhoodInput: 'Centro',
    clientHouseNumberInput: '1',
    clientStreetInput: 'Rua de teste',
  }))
    get(field).value = value;
  get('confirmClientName').emit('click');
  await settle();
  return { alert, fetch, get, document };
}

describe('ações de pedidos na página Produtos', () => {
  it('fecha a lista pelo cabeçalho, clique fora e Escape', async () => {
    const { document, get } = await setup();
    const button = get('orders-btn');
    const orders = get('client-orders-list');

    button.emit('click');
    expect(orders.classList.contains('active')).toBe(true);
    expect(button.attributes.get('aria-expanded')).toBe('true');
    orders.emit('click');
    expect(orders.classList.contains('active')).toBe(true);
    orders.querySelector('[data-close-orders]')!.emit('click');
    expect(orders.classList.contains('active')).toBe(false);
    expect(button.attributes.get('aria-expanded')).toBe('false');

    button.emit('click');
    get('searchInput').emit('click');
    expect(orders.classList.contains('active')).toBe(false);
    button.emit('click');
    document.emit('keydown', document, 'Escape');
    expect(orders.classList.contains('active')).toBe(false);
  });

  it('confirma quantidade e ajusta um UUID imediatamente até o limite do estoque', async () => {
    const { alert, fetch, get } = await setup();
    const card = get('product-container').children[0];
    const add = card.children.at(-1)!.children[0];
    const input = get('product-quantity');
    const dialog = get('quantity-dialog');
    const form = get('quantity-form');
    const list = get('cart-list');
    fetch.mockClear();

    add.emit('click');
    expect(dialog.open).toBe(true);
    expect(input.max).toBe('3');
    expect(get('cart-count').textContent).toBe('0');
    input.value = '1.5';
    form.emit('submit');
    expect(dialog.open).toBe(true);
    expect(get('quantity-error').textContent).toContain('quantidade inteira');
    input.value = '4';
    form.emit('submit');
    expect(get('cart-count').textContent).toBe('0');
    input.value = '2';
    form.emit('submit');
    expect(dialog.open).toBe(false);
    expect(get('cart-count').textContent).toBe('2');

    const row = list.querySelector('.cart-item')!;
    const plus = row.querySelector("[data-action='cart-add']")!;
    const minus = row.querySelector("[data-action='cart-remove']")!;
    expect(plus.dataset.id).toBe(productId);
    plus.emit('click');
    expect(list.querySelector('.cart-item')).toBe(row);
    expect(row.querySelector('[data-cart-quantity]')!.textContent).toBe(
      'Quantidade: 3',
    );
    expect(list.querySelector('[data-cart-total]')!.textContent).toMatch(
      /33,96/,
    );
    expect(plus.disabled).toBe(true);
    plus.emit('click');
    expect(get('cart-count').textContent).toBe('3');

    minus.emit('click');
    expect(get('cart-count').textContent).toBe('2');
    add.emit('click');
    expect(input.max).toBe('1');
    get('close-quantity').emit('click');
    expect(get('cart-count').textContent).toBe('2');
    expect(plus.disabled).toBe(false);
    minus.emit('click');
    minus.emit('click');
    expect(list.querySelector('.cart-item')).toBeNull();
    expect(get('cart-count').textContent).toBe('0');
    expect(alert).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('abre a seleção pelos detalhes e mantém IDs numéricos da demonstração', async () => {
    const { fetch, get } = await setup(true);
    get('product-container').children[0].emit('click');
    get('detailAddToCart').emit('click');
    expect(get('quantity-dialog').open).toBe(true);
    get('quantity-form').emit('submit');
    const plus = get('cart-list').querySelector("[data-action='cart-add']")!;
    expect(plus.dataset.id).toBe('1');
    plus.emit('click');
    expect(get('cart-count').textContent).toBe('2');
    expect(fetch).not.toHaveBeenCalled();
  });
});
