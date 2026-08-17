import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

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

export function buildHeaders(apiKey, cdiVersion) {
  const headers = {
    rid: 'emailpassword',
    'cdi-version': cdiVersion,
    'content-type': 'application/json',
  };
  if (apiKey) headers['api-key'] = apiKey;
  return headers;
}

export function selectCompatibleVersion(versions) {
  if (!Array.isArray(versions) || versions.length === 0) {
    throw new Error('SuperTokens Core returned no supported CDI versions');
  }
  const parsed = versions.map((version) => {
    const value = String(version);
    const segments = value.split('.').map((segment) => Number(segment));
    if (segments.some((segment) => !Number.isInteger(segment) || segment < 0)) {
      throw new Error('SuperTokens Core returned an invalid CDI version');
    }
    return { value, segments };
  });
  parsed.sort((left, right) => {
    const length = Math.max(left.segments.length, right.segments.length);
    for (let index = 0; index < length; index += 1) {
      const difference =
        (left.segments[index] ?? 0) - (right.segments[index] ?? 0);
      if (difference !== 0) return difference;
    }
    return 0;
  });
  return parsed.at(-1).value;
}

export async function resolveCdiVersion(baseUrl, apiKey) {
  const response = await fetch(new URL('/apiversion', baseUrl), {
    headers: apiKey ? { 'api-key': apiKey } : {},
  });
  if (!response.ok) {
    throw new Error(
      `Unable to resolve SuperTokens CDI version: HTTP ${response.status}`,
    );
  }
  const payload = await response.json();
  return selectCompatibleVersion(payload.versions);
}

export function coreRequest(baseUrl, path, body, apiKey, cdiVersion) {
  return {
    url: new URL(path, baseUrl),
    init: {
      method: 'POST',
      headers: buildHeaders(apiKey, cdiVersion),
      body: JSON.stringify(body),
    },
  };
}

export async function requestCore(
  baseUrl,
  path,
  { apiKey, cdiVersion, body, method = 'POST', timeoutMs = 5000 } = {},
) {
  const request =
    method === 'GET'
      ? {
          url: new URL(path, baseUrl),
          init: {
            method,
            headers: apiKey ? { 'api-key': apiKey } : {},
          },
        }
      : coreRequest(baseUrl, path, body, apiKey, cdiVersion);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(request.url, {
      ...request.init,
      signal: controller.signal,
    });
    const text = await response.text();
    return { response, text, request };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(
        `SuperTokens Core request timed out: ${request.url.pathname}`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function sanitizeCoreBody(body) {
  return String(body)
    .replace(/(api[-_ ]?key|password|secret|token)[^,;\n]*/gi, '$1=[REDACTED]')
    .slice(0, 300);
}

export function assertRecoveryTokenResponse(result) {
  assert.equal(result.response.status, 200);
  assert.equal(result.json.status, 'OK');
  assert.equal(typeof result.json.token, 'string');
  assert.ok(result.json.token.length > 0);
  return result.json.token;
}

export function assertRecoveryResponse(result) {
  assert.equal(result.response.status, 200);
  assert.equal(result.json.status, 'OK');
}

export async function callCore(baseUrl, path, body, apiKey, cdiVersion) {
  const { response, text, request } = await requestCore(baseUrl, path, {
    apiKey,
    cdiVersion,
    body,
  });
  if (response.status === 404) {
    throw new Error(
      `Unexpected SuperTokens Core response: HTTP 404 POST ${request.url.pathname} rid=${request.init.headers.rid} cdi-version=${cdiVersion} body=${sanitizeCoreBody(text)}`,
    );
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { response, json, request };
}

async function main() {
  const base = createCoreBaseUrl(process.env.SUPERTOKENS_CONNECTION_URI);
  const key = process.env.SUPERTOKENS_API_KEY;
  assert.ok(key && !key.includes('\n'));
  const cdiVersion = await resolveCdiVersion(base, key);
  const email = `ci-${Date.now()}@example.invalid`;
  const password = 'Synthetic-CI-password-42!';
  const call = (path, body, apiKey = key) =>
    callCore(base, path, body, apiKey, cdiVersion);
  const health = await requestCore(base, '/hello', {
    apiKey: key,
    method: 'GET',
  });
  assert.equal(health.response.status, 200);
  assert.match(health.text, /Hello/);
  const signupBody = { email, password };
  const invalid = await call('/recipe/signup', signupBody, 'invalid-ci-key');
  assert.equal(invalid.response.status, 401);
  const signup = await call('/recipe/signup', signupBody);
  assert.equal(signup.response.status, 200);
  assert.equal(signup.json.status, 'OK');
  const userId = signup.json.userId ?? signup.json.user?.id;
  assert.equal(typeof userId, 'string');
  assert.ok(userId.length > 0);
  const duplicate = await call('/recipe/signup', signupBody);
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
  const resetToken = await call('/recipe/user/password/reset/token', {
    userId,
    email,
  });
  const token = assertRecoveryTokenResponse(resetToken);
  const newPassword = 'Synthetic-CI-new-password-43!';
  const reset = await call('/recipe/user/password/reset', {
    method: 'token',
    token,
    newPassword,
  });
  assertRecoveryResponse(reset);
  const newPasswordSignin = await call('/recipe/signin', {
    email,
    password: newPassword,
  });
  assert.equal(newPasswordSignin.response.status, 200);
  assert.equal(newPasswordSignin.json.status, 'OK');
  const oldPasswordSignin = await call('/recipe/signin', {
    email,
    password,
  });
  assert.equal(oldPasswordSignin.response.status, 200);
  assert.equal(oldPasswordSignin.json.status, 'WRONG_CREDENTIALS_ERROR');
  console.log(
    JSON.stringify({
      health: true,
      cdiVersion,
      apiKeyRejected: true,
      signup: true,
      duplicateRejected: true,
      signin: true,
      wrongPassword: true,
      missingUser: true,
      recoveryTokenCreated: true,
      recoveryTokenConsumed: true,
      newPasswordSignin: true,
      oldPasswordRejected: true,
      synthetic: true,
    }),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
