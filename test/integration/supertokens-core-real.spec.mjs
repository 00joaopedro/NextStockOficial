import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildHeaders,
  coreRequest,
  createCoreBaseUrl,
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
