'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeText } = require('./production-test-preflight');

test('sanitizes provider text before it reaches logs or terminal output', () => {
  assert.equal(sanitizeText('bad\nvalue <secret>'), 'bad value _secret_');
});
