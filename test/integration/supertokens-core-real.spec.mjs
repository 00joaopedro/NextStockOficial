import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHeaders, createCoreBaseUrl } from './supertokens-core-real.mjs';

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

test('keeps the API key in headers and never constructs it into the URL', () => {
  const headers = buildHeaders('synthetic-key');
  assert.equal(headers['api-key'], 'synthetic-key');
  assert.equal(
    new URL('/recipe/user/signup', createCoreBaseUrl('http://127.0.0.1:3567'))
      .username,
    '',
  );
  assert.equal(
    new URL('/recipe/user/signup', createCoreBaseUrl('http://127.0.0.1:3567'))
      .password,
    '',
  );
  assert.equal(buildHeaders(undefined)['api-key'], undefined);
});
