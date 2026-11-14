import { hasFirebirdReader, inspectFirebird } from './firebird-import';

describe('Firebird reader gateway', () => {
  const keys = [
    'NEXTSTOCK_FIREBIRD_READER_URL',
    'NEXTSTOCK_FIREBIRD_READER_TOKEN',
  ] as const;
  const saved = keys.map((key) => process.env[key]);
  afterEach(() => {
    keys.forEach((key, i) => {
      if (saved[i] === undefined) delete process.env[key];
      else process.env[key] = saved[i];
    });
    jest.restoreAllMocks();
  });

  it('is disabled without a private reader configuration', async () => {
    for (const key of keys) delete process.env[key];
    expect(hasFirebirdReader()).toBe(false);
    await expect(inspectFirebird(Buffer.from('file'))).rejects.toThrow(
      'indisponível',
    );
  });

  it('sends the file to the configured origin and reports an incompatible base', async () => {
    process.env.NEXTSTOCK_FIREBIRD_READER_URL = 'https://reader.example.test';
    process.env.NEXTSTOCK_FIREBIRD_READER_TOKEN =
      'fixture-only-123456789012345678901';
    const mock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('{"tables":["PRODUTOS"]}'))
      .mockResolvedValueOnce(new Response('{}', { status: 422 }));
    await expect(inspectFirebird(Buffer.from('file'))).resolves.toEqual({
      tables: ['PRODUTOS'],
    });
    await expect(
      inspectFirebird(Buffer.from('file'), 'LOJA & PRODUTOS'),
    ).rejects.toThrow('exporte CSV');
    expect(String(mock.mock.calls[1][0])).toBe(
      'https://reader.example.test/inspect?table=LOJA+%26+PRODUTOS',
    );
    expect(mock.mock.calls[1][1]).toMatchObject({
      method: 'POST',
      redirect: 'error',
    });
  });
});
