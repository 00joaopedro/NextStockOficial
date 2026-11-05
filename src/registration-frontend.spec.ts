import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

describe('public registration retry UI', () => {
  function fixture(search = '', initialStorage: Record<string, string> = {}) {
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
    let login!: (event: { preventDefault(): void }) => Promise<void>;
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
            if (id === 'loginForm' && name === 'submit') login = handler;
          },
        });
      return elements.get(id)!;
    };
    get('registerEmail').value = 'first@example.test';
    get('registerName').value = 'First name';
    get('registerCompanyName').value = 'First company';
    get('registerPassword').value = 'Secret123';
    get('registerSystemType').value = 'padrao';
    const stored = new Map<string, string>(Object.entries(initialStorage));
    const fetch = jest.fn();
    let sequence = 0;
    runInNewContext(
      readFileSync(
        join(__dirname, '../public/Js/csp-extracted/index-inline1.js'),
        'utf8',
      ),
      {
        URLSearchParams,
        crypto: { randomUUID: jest.fn(() => `attempt-${++sequence}`) },
        window: {
          location: { search, href: '' },
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
      login: () => login({ preventDefault: () => undefined }),
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
  const attemptKey = 'nextstockPromotionReservationIdempotency';
  const selectionKey = 'nextstockPromotionSelection';
  const response = (data: unknown, ok = true) => ({
    ok,
    status: ok ? 200 : 503,
    text: () => Promise.resolve(JSON.stringify(data)),
  });
  const account = (user = 'user-1', tenant = 'tenant-1') => ({
    user: { id: user },
    selectedBranch: { id: 'branch-1', tenantId: tenant },
  });
  const promo = '?promo=lancamento-2026&plan=ouro&period=6';
  function reservationKey(f: ReturnType<typeof fixture>, call: number) {
    return (
      f.fetch.mock.calls[call] as [string, { headers: Record<string, string> }]
    )[1].headers['Idempotency-Key'];
  }
  async function failReservation(
    f: ReturnType<typeof fixture>,
    auth = account(),
  ) {
    f.fetch
      .mockResolvedValueOnce(response(auth))
      .mockResolvedValueOnce(response({}, false));
    await f.submit();
  }

  it('reuses a failed attempt only for the same account, tenant and offer', async () => {
    const f = fixture(promo);
    await failReservation(f);
    const first = reservationKey(f, 1);
    await failReservation(f);
    expect(reservationKey(f, 3)).toBe(first);
    await failReservation(f, account('user-2', 'tenant-2'));
    expect(reservationKey(f, 5)).not.toBe(first);
    expect(JSON.stringify([...f.stored])).not.toContain('Secret123');
  });

  it.each([
    { planSlug: 'esmeralda', periodMonths: 6 },
    { planSlug: 'ouro', periodMonths: 3 },
  ])('starts a new attempt when the offer changes to %j', async (offer) => {
    const f = fixture(promo);
    await failReservation(f);
    const first = reservationKey(f, 1);
    f.stored.set(
      selectionKey,
      JSON.stringify({ campaignSlug: 'lancamento-2026', ...offer }),
    );
    await failReservation(f);
    expect(reservationKey(f, 3)).not.toBe(first);
  });

  it.each([
    'legacy-key-12345',
    '{invalid',
    JSON.stringify({ scope: 'another-account', key: 'old-key-123' }),
  ])(
    'does not reuse an unscoped or invalid stored attempt: %s',
    async (stored) => {
      const f = fixture(promo);
      f.stored.set(attemptKey, stored);
      await failReservation(f);
      expect(reservationKey(f, 1)).toBe('attempt-1');
    },
  );

  it('clears the attempt after a successful reservation and keeps the response format', async () => {
    const f = fixture(promo);
    f.fetch
      .mockResolvedValueOnce(response(account()))
      .mockResolvedValueOnce(
        response({ reservationId: 'reservation-1', status: 'RESERVED' }),
      );
    await f.submit();
    expect(f.stored.has(attemptKey)).toBe(false);
    expect(JSON.parse(f.stored.get('nextstockPromotionReservation')!)).toEqual({
      reservationId: 'reservation-1',
      status: 'RESERVED',
    });
  });

  it('does not reserve without an authenticated tenant context', async () => {
    const f = fixture(promo);
    f.fetch.mockResolvedValueOnce(response({ user: { id: 'user-1' } }));
    await f.submit();
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(f.stored.has(attemptKey)).toBe(false);
  });
  it.each(['', '?promo=none', '?promo=lancamento-2026&plan=invalid&period=6'])(
    'normal signup clears previous promotional state: %s',
    async (search) => {
      const f = fixture(search, {
        nextstockPromotionSelection: JSON.stringify({
          campaignSlug: 'lancamento-2026',
          planSlug: 'ouro',
          periodMonths: 6,
        }),
        nextstockPromotionReservation: JSON.stringify({
          reservationId: 'old-reservation',
          status: 'RESERVED',
        }),
        nextstockPromotionReservationIdempotency: 'old-attempt',
      });
      expect(f.stored.has(selectionKey)).toBe(false);
      expect(f.stored.has(attemptKey)).toBe(false);
      f.fetch.mockResolvedValueOnce(response(account()));
      await f.submit();
      expect(f.fetch).toHaveBeenCalledTimes(1);
      expect(f.stored.has('nextstockPromotionReservation')).toBe(false);
    },
  );

  it('recovers reservation through login after registration succeeded but reservation failed', async () => {
    const f = fixture(promo);
    await failReservation(f);
    const firstKey = reservationKey(f, 1);
    f.fetch
      .mockResolvedValueOnce(response(account()))
      .mockResolvedValueOnce(
        response({ reservationId: 'recovered', status: 'RESERVED' }),
      );
    await f.login();
    expect((f.fetch.mock.calls[2] as [string, unknown])[0]).toBe(
      '/api/auth/login',
    );
    expect(reservationKey(f, 3)).toBe(firstKey);
    expect(
      (
        JSON.parse(f.stored.get('nextstockPromotionReservation')!) as {
          reservationId: string;
        }
      ).reservationId,
    ).toBe('recovered');
    expect(f.stored.has(attemptKey)).toBe(false);
  });

  it('never reserves a promotion during ordinary login', async () => {
    const f = fixture();
    f.fetch.mockResolvedValueOnce(response(account()));
    await f.login();
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(f.stored.has(selectionKey)).toBe(false);
  });
});
