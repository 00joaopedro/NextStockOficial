import test from 'node:test';
import assert from 'node:assert/strict';
import { isKnownOptionalSharpOrphan, validateTree } from './verify-dependency-tree.mjs';

const lock = {
  packages: {
    'node_modules/@emnapi/runtime': { version: '1.11.3', optional: true },
    'node_modules/@img/sharp-wasm32': {
      optional: true,
      dependencies: { '@emnapi/runtime': '^1.11.3' },
    },
  },
};
const orphan = 'extraneous: @emnapi/runtime@1.11.3 C:\\repo\\node_modules\\@emnapi\\runtime';

test('clean tree passes', () => assert.deepEqual(validateTree({ problems: [] }, lock).remaining, []));
test('invalid problem fails', () => assert.throws(() => validateTree({ problems: ['invalid: foo@1.0.0'] }, lock)));
test('missing problem fails', () => assert.throws(() => validateTree({ problems: ['missing: foo@^1.0.0, required by bar@1.0.0'] }, lock)));
test('arbitrary extraneous fails', () => assert.throws(() => validateTree({ problems: ['extraneous: foo@1.0.0 C:\\repo\\node_modules\\foo'] }, lock)));
test('known optional Sharp orphan is tolerated only with exact lock relationship', () => {
  assert.equal(isKnownOptionalSharpOrphan(orphan, lock), true);
  assert.deepEqual(validateTree({ problems: [orphan] }, lock).remaining, []);
});
test('unexpected version or path fails', () => {
  assert.equal(isKnownOptionalSharpOrphan(orphan.replace('1.11.3', '1.11.2'), lock), false);
  assert.equal(isKnownOptionalSharpOrphan(orphan.replace('@emnapi\\runtime', 'other'), lock), false);
});
test('two simultaneous problems are not masked', () => {
  assert.throws(() => validateTree({ problems: [orphan, 'invalid: foo@1.0.0'] }, lock));
});
