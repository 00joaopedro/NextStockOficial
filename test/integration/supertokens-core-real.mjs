import assert from 'node:assert/strict';

const base = process.env.SUPERTOKENS_CONNECTION_URI || 'http://127.0.0.1:3567';
const key = process.env.SUPERTOKENS_API_KEY;
assert.ok(key && !key.includes('\n'));
const email = `ci-${Date.now()}@example.invalid`;
const password = 'Synthetic-CI-password-42!';
async function call(path, body, apiKey = key) {
  const response = await fetch(new URL(path, base), { method: body === undefined ? 'GET' : 'POST', headers: { 'api-key': apiKey, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { response, json };
}
const health = await call('/hello'); assert.equal(health.response.status, 200); assert.match(String(health.json), /Hello/);
const invalid = await call('/recipe/user/signup', { email, password }, 'invalid-ci-key'); assert.equal(invalid.response.status, 401);
const signup = await call('/recipe/user/signup', { email, password }); assert.equal(signup.response.status, 200); assert.equal(signup.json.status, 'OK');
const duplicate = await call('/recipe/user/signup', { email, password }); assert.equal(duplicate.json.status, 'EMAIL_ALREADY_EXISTS_ERROR');
const signin = await call('/recipe/signin', { email, password }); assert.equal(signin.response.status, 200); assert.equal(signin.json.status, 'OK');
const wrong = await call('/recipe/signin', { email, password: 'wrong-password' }); assert.equal(wrong.json.status, 'WRONG_CREDENTIALS_ERROR');
const missing = await call('/recipe/signin', { email: 'missing@example.invalid', password }); assert.equal(missing.json.status, 'WRONG_CREDENTIALS_ERROR');
const reset = await call('/recipe/user/password/reset'); assert.notEqual(reset.response.status, 500);
console.log(JSON.stringify({ health: true, apiKeyRejected: true, signup: true, duplicateRejected: true, signin: true, wrongPassword: true, missingUser: true, recoveryEndpoint: true, synthetic: true }));
