import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

describe('public registration retry UI', () => {
  function fixture() {
    type Element = {
      value: string;
      textContent: string;
      disabled: boolean;
      style: Record<string, string>;
      addEventListener: (
        name: string,
        handler: (event: { preventDefault(): void }) => Promise<void>,
      ) => void;
    };
    const elements = new Map<string, Element>();
    let submit!: (event: { preventDefault(): void }) => Promise<void>;
    const get = (id: string) => {
      if (!elements.has(id))
        elements.set(id, {
          value: '',
          textContent: '',
          disabled: false,
          style: {},
          addEventListener: (name, handler) => {
            if (id === 'registerForm' && name === 'submit') submit = handler;
          },
        });
      return elements.get(id)!;
    };
    get('registerEmail').value = 'first@example.test';
    get('registerName').value = 'First name';
    get('registerCompanyName').value = 'First company';
    get('registerPassword').value = 'Secret123';
    get('registerSystemType').value = 'padrao';
    const stored = new Map<string, string>();
    const fetch = jest.fn();
    runInNewContext(
      readFileSync(
        join(__dirname, '../public/Js/csp-extracted/index-inline1.js'),
        'utf8',
      ),
      {
        URLSearchParams,
        window: {
          location: { search: '', href: '' },
          addEventListener: () => undefined,
        },
        document: {
          getElementById: (id: string) =>
            id.startsWith('googleLogin') ? null : get(id),
          querySelector: () => get('submitButton'),
          querySelectorAll: () => [],
        },
        sessionStorage: {
          getItem: (key: string) => stored.get(key) ?? null,
          setItem: (key: string, value: string) => stored.set(key, value),
          removeItem: (key: string) => stored.delete(key),
          clear: () => stored.clear(),
        },
        fetch,
      },
    );
    return {
      get,
      fetch,
      stored,
      submit: () => submit({ preventDefault: () => undefined }),
    };
  }

  it('blocks duplicate submits and releases the form after a temporary failure', async () => {
    const f = fixture();
    let resolve!: (response: unknown) => void;
    f.fetch.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const first = f.submit();
    expect(f.get('submitButton').disabled).toBe(true);
    await f.submit();
    expect(f.fetch).toHaveBeenCalledTimes(1);
    resolve({
      ok: false,
      status: 503,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            requestId: 'test-request-123',
            message: 'internal',
          }),
        ),
    });
    await first;
    expect(f.get('submitButton').disabled).toBe(false);
    expect(f.get('statusBox').textContent).toContain('test-request-123');
    expect(JSON.stringify([...f.stored])).not.toContain('Secret123');
    f.fetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            code: 'REGISTRATION_IN_PROGRESS',
            message: 'Seu cadastro já está em andamento.',
          }),
        ),
    });
    await f.submit();
    expect(f.fetch).toHaveBeenCalledTimes(2);
    expect(f.get('statusBox').textContent).toContain(
      'Seu cadastro já está em andamento.',
    );
  });

  it('uses fresh account data when registering another email in the same page', async () => {
    const f = fixture();
    f.fetch.mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve('{}'),
    });
    await f.submit();
    f.get('registerEmail').value = 'second@example.test';
    await f.submit();
    const second = f.fetch.mock.calls[1] as [string, { body: string }];
    expect(JSON.parse(second[1].body) as Record<string, unknown>).toMatchObject(
      { email: 'second@example.test' },
    );
    expect(f.get('submitButton').disabled).toBe(false);
  });
});
