import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const compose = readFileSync('infra/supertokens/docker-compose.rehearsal.yml', 'utf8');
const docs = readFileSync('infra/supertokens/README.md', 'utf8');
assert.match(compose, /supertokens\/supertokens-postgresql:11\.0/);
assert.match(compose, /postgres:16\.4-alpine/);
assert.match(compose, /supertokens-core-db/);
assert.match(compose, /127\.0\.0\.1:3567/);
assert.match(compose, /\/hello/);
assert.match(compose, /SUPERTOKENS_CONNECTION_URI/);
assert.doesNotMatch(compose, /POSTGRES_PASSWORD:\s*['"]?[^$\s]/i);
assert.doesNotMatch(compose, /API_KEYS:\s*(?!\$\{)[^\s]/i);
assert.doesNotMatch(docs, /postgresql:\/\/[^$\s]+:[^$\s]+@/i);
console.log('SuperTokens rehearsal artifacts are structurally valid and secret-free.');
