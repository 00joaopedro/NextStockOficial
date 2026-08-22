import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonDocument } from './validate-supertokens-evidence.mjs';

test('rejects empty, truncated, and concatenated JSON', () => {
  assert.throws(() => parseJsonDocument('', 'empty'), /stdout is empty/);
  assert.throws(
    () => parseJsonDocument('{"ready":false', 'truncated'),
    /exactly one JSON/,
  );
  assert.throws(
    () => parseJsonDocument('{"a":1}{"b":2}', 'concatenated'),
    /exactly one JSON/,
  );
});

test('accepts one complete JSON document', () => {
  assert.deepEqual(parseJsonDocument('{"pii":false}\n', 'valid'), {
    pii: false,
  });
});
