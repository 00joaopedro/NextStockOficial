import assert from 'node:assert/strict';

export function createCoreBaseUrl(connectionUri) {
  if (!connectionUri) throw new Error('SUPERTOKENS_CONNECTION_URI is required');
  const baseUrl = new URL(connectionUri);
  if (!['http:', 'https:'].includes(baseUrl.protocol)) {
    throw new Error('SUPERTOKENS_CONNECTION_URI must be an HTTP URL');
  }
  if (baseUrl.username || baseUrl.password) {
    throw new Error(
      'SUPERTOKENS_CONNECTION_URI must not contain embedded credentials',
    );
  }
  return baseUrl;
}

export function buildHeaders(apiKey) {
  const headers = { 'content-type': 'application/json' };
  if (apiKey) headers['api-key'] = apiKey;
  return headers;
}

export async function callCore(baseUrl, path, body, apiKey) {
  const response = await fetch(new URL(path, baseUrl), {
    method: body === undefined ? 'GET' : 'POST',
    headers: buildHeaders(apiKey),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { response, json };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const base = createCoreBaseUrl(process.env.SUPERTOKENS_CONNECTION_URI);
  const key = process.env.SUPERTOKENS_API_KEY;
  assert.ok(key && !key.includes('\n'));
  const email = `ci-${Date.now()}@example.invalid`;
  const password = 'Synthetic-CI-password-42!';
  const call = (path, body, apiKey = key) => callCore(base, path, body, apiKey);
  const health = await call('/hello', undefined, undefined);
  assert.equal(health.response.status, 200);
  assert.match(String(health.json), /Hello/);
  const invalid = await call(
    '/recipe/user/signup',
    { email, password },
    'invalid-ci-key',
  );
  assert.equal(invalid.response.status, 401);
  const signup = await call('/recipe/user/signup', { email, password });
  assert.equal(signup.response.status, 200);
  assert.equal(signup.json.status, 'OK');
  const duplicate = await call('/recipe/user/signup', { email, password });
  assert.equal(duplicate.json.status, 'EMAIL_ALREADY_EXISTS_ERROR');
  const signin = await call('/recipe/signin', { email, password });
  assert.equal(signin.response.status, 200);
  assert.equal(signin.json.status, 'OK');
  const wrong = await call('/recipe/signin', {
    email,
    password: 'wrong-password',
  });
  assert.equal(wrong.json.status, 'WRONG_CREDENTIALS_ERROR');
  const missing = await call('/recipe/signin', {
    email: 'missing@example.invalid',
    password,
  });
  assert.equal(missing.json.status, 'WRONG_CREDENTIALS_ERROR');
  const reset = await call('/recipe/user/password/reset');
  assert.notEqual(reset.response.status, 500);
  console.log(
    JSON.stringify({
      health: true,
      apiKeyRejected: true,
      signup: true,
      duplicateRejected: true,
      signin: true,
      wrongPassword: true,
      missingUser: true,
      recoveryEndpoint: true,
      synthetic: true,
    }),
  );
}
