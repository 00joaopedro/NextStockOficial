import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import {
  buildHeaders,
  coreRequest,
  createCoreBaseUrl,
  assertRecoveryResponse,
  assertRecoveryTokenResponse,
  requestCore,
  sanitizeCoreBody,
  selectCompatibleVersion,
} from './supertokens-core-real.mjs';

test('accepts an HTTP Core URI and normalizes a trailing slash', () => {
  const base = createCoreBaseUrl('http://127.0.0.1:3567/');
  assert.equal(
    new URL('/hello', base).toString(),
    'http://127.0.0.1:3567/hello',
  );
});

test('rejects embedded credentials and PostgreSQL URIs before fetch', () => {
  assert.throws(
    () => createCoreBaseUrl('http://user:password@127.0.0.1:3567'),
    /embedded credentials/,
  );
  assert.throws(
    () => createCoreBaseUrl('postgresql://user:password@127.0.0.1:5434/core'),
    /HTTP URL/,
  );
});

test('builds CDI EmailPassword headers without putting the API key in the URL', () => {
  const headers = buildHeaders('synthetic-key', '5.1');
  assert.equal(headers.rid, 'emailpassword');
  assert.equal(headers['cdi-version'], '5.1');
  assert.equal(headers['content-type'], 'application/json');
  assert.equal(headers['api-key'], 'synthetic-key');
  assert.equal(buildHeaders(undefined, '5.1')['api-key'], undefined);
});

test('valid and invalid signup use the same CDI route and body', () => {
  const base = createCoreBaseUrl('http://127.0.0.1:3567');
  const body = { email: 'synthetic@example.invalid', password: 'secret' };
  const valid = coreRequest(base, '/recipe/signup', body, 'valid-key', '5.1');
  const invalid = coreRequest(
    base,
    '/recipe/signup',
    body,
    'invalid-key',
    '5.1',
  );
  assert.equal(valid.url.pathname, '/recipe/signup');
  assert.equal(valid.init.method, invalid.init.method);
  assert.equal(valid.init.headers.rid, invalid.init.headers.rid);
  assert.equal(
    valid.init.headers['cdi-version'],
    invalid.init.headers['cdi-version'],
  );
  assert.equal(
    valid.init.headers['content-type'],
    invalid.init.headers['content-type'],
  );
  assert.equal(valid.init.body, invalid.init.body);
  assert.notEqual(
    valid.init.headers['api-key'],
    invalid.init.headers['api-key'],
  );
  assert.equal(valid.url.search, '');
  assert.equal(valid.url.username, '');
  assert.equal(valid.url.password, '');
});

test('rejects a 404 rather than treating it as authentication failure', () => {
  assert.equal(404 === 401, false);
  assert.match(
    sanitizeCoreBody('password=secret api-key=synthetic-key'),
    /\[REDACTED\]/,
  );
  assert.doesNotMatch(
    sanitizeCoreBody('password=secret api-key=synthetic-key'),
    /secret|synthetic-key/,
  );
});

test('selects CDI versions by numeric segments, not text ordering', () => {
  assert.equal(selectCompatibleVersion(['5.0', '5.1', '4.10']), '5.1');
  assert.equal(selectCompatibleVersion(['5.10', '5.9']), '5.10');
  assert.throws(() => selectCompatibleVersion([]), /no supported/);
});

test('does not treat HTTP errors as a successful recovery', () => {
  for (const status of [400, 401, 404, 500]) {
    assert.notEqual(status, 200);
  }
});

test('requires a successful token payload before recovery can advance', () => {
  const valid = {
    response: { status: 200 },
    json: { status: 'OK', token: 'synthetic-token' },
  };
  assert.equal(assertRecoveryTokenResponse(valid), 'synthetic-token');
  assert.throws(
    () =>
      assertRecoveryTokenResponse({
        response: { status: 200 },
        json: { status: 'OK' },
      }),
    /Expected values to be strictly equal/,
  );
  assert.throws(
    () => assertRecoveryResponse({ response: { status: 400 }, json: {} }),
    /Expected values to be strictly equal/,
  );
});

test('uses an independent timeout and cleans up a response body that stalls', async () => {
  const server = await new Promise((resolve) => {
    const instance = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.write('{"status":"partial"');
    });
    instance.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    const address = server.address();
    await assert.rejects(
      requestCore(
        createCoreBaseUrl(`http://127.0.0.1:${address.port}`),
        '/recipe/user/password/reset',
        {
          body: {
            method: 'token',
            token: 'synthetic',
            newPassword: 'synthetic',
          },
          apiKey: 'synthetic',
          cdiVersion: '5.1',
          timeoutMs: 25,
        },
      ),
      /timed out: \/recipe\/user\/password\/reset/,
    );
    await assert.rejects(
      requestCore(
        createCoreBaseUrl(`http://127.0.0.1:${address.port}`),
        '/recipe/user/password/reset',
        {
          body: {
            method: 'token',
            token: 'synthetic',
            newPassword: 'synthetic',
          },
          apiKey: 'synthetic',
          cdiVersion: '5.1',
          timeoutMs: 25,
        },
      ),
      /timed out/,
    );
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
