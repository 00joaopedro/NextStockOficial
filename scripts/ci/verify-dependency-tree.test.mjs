import test from 'node:test';
import assert from 'node:assert/strict';
import { isKnownSharpWasmOrphan, isFastifyStaticCompatibilityException, validateTree } from './verify-dependency-tree.mjs';

const lock = { packages: {
  'node_modules/sharp': { version: '0.35.2', resolved: 'sharp.tgz', integrity: 'sha512-sharp', optionalDependencies: { '@img/sharp-wasm32': '0.35.2' } },
  'node_modules/@img/sharp-wasm32': { version: '0.35.2', resolved: 'wasm.tgz', integrity: 'sha512-wasm', optional: true, dependencies: { '@emnapi/runtime': '^1.11.3' } },
  'node_modules/@emnapi/runtime': { version: '1.11.3', resolved: 'runtime.tgz', integrity: 'sha512-runtime', optional: true },
  'node_modules/@fastify/static': { version: '10.1.2', resolved: 'static.tgz', integrity: 'sha512-static' },
  'node_modules/@nestjs/platform-fastify': { version: '11.1.28', peerDependencies: { '@fastify/static': '^8.0.0 || ^9.0.0' } },
  'node_modules/@nestjs/serve-static': { version: '5.0.5', peerDependencies: { '@fastify/static': '^8.0.4 || ^9.0.0' } },
} };
const tree = { dependencies: { sharp: { version: '0.35.2' }, '@fastify/static': { version: '10.1.2' } } };
const wasm = 'extraneous: @img/sharp-wasm32@0.35.2 C:\\repo\\node_modules\\@img\\sharp-wasm32';
const emnapi = 'extraneous: @emnapi/runtime@1.11.3 C:\\repo\\node_modules\\@emnapi\\runtime';
const fastify = 'invalid: @fastify/static@10.1.2 C:\\repo\\node_modules\\@fastify\\static';

test('clean tree passes', () => assert.deepEqual(validateTree({ problems: [] }, lock).remaining, []));
test('exact Sharp/WASM subtree passes', () => assert.equal(isKnownSharpWasmOrphan([wasm, emnapi], lock, tree), true));
test('lockfile-selected emnapi 1.11.1 also passes without a version allowlist', () => {
  const lockfile = structuredClone(lock);
  lockfile.packages['node_modules/@emnapi/runtime'].version = '1.11.1';
  lockfile.packages['node_modules/@img/sharp-wasm32'].dependencies['@emnapi/runtime'] = '^1.11.1';
  assert.equal(isKnownSharpWasmOrphan([wasm, emnapi.replace('1.11.3', '1.11.1')], lockfile, tree), true);
});
test('Sharp subtree version divergence fails', () => assert.equal(isKnownSharpWasmOrphan([wasm.replace('0.35.2', '0.35.3'), emnapi], lock, tree), false));
test('installed version different from lockfile fails', () => assert.equal(isKnownSharpWasmOrphan([wasm, emnapi.replace('1.11.3', '1.11.1')], lock, tree), false));
test('only emnapi or only wasm fails', () => { assert.equal(isKnownSharpWasmOrphan([emnapi], lock, tree), false); assert.equal(isKnownSharpWasmOrphan([wasm], lock, tree), false); });
test('Sharp WASM without Sharp relation fails', () => assert.equal(isKnownSharpWasmOrphan([wasm, emnapi], { packages: { ...lock.packages, 'node_modules/sharp': { ...lock.packages['node_modules/sharp'], optionalDependencies: {} } } }, tree), false));
test('exact Fastify compatibility exception passes', () => assert.equal(isFastifyStaticCompatibilityException(fastify, lock, tree), true));
test('Fastify 9.x and changed Nest versions fail', () => { assert.equal(isFastifyStaticCompatibilityException(fastify.replace('10.1.2', '9.3.0'), lock, tree), false); assert.equal(isFastifyStaticCompatibilityException(fastify, { packages: { ...lock.packages, 'node_modules/@nestjs/platform-fastify': { ...lock.packages['node_modules/@nestjs/platform-fastify'], version: '11.1.29' } } }, tree), false); });
test('missing resolved/integrity fails', () => assert.equal(isFastifyStaticCompatibilityException(fastify, { packages: { ...lock.packages, 'node_modules/@fastify/static': { version: '10.1.2' } } }, tree), false));
test('arbitrary extraneous, invalid, missing and peer missing fail', () => { for (const problem of ['extraneous: foo@1.0.0 C:\\repo\\node_modules\\foo', 'invalid: foo@1.0.0 C:\\repo\\node_modules\\foo', 'missing: foo@^1.0.0, required by bar@1.0.0', 'peer missing: foo@1.0.0']) assert.throws(() => validateTree({ problems: [problem] }, lock)); });
test('third Fastify requester fails', () => assert.throws(() => validateTree({ problems: [fastify, 'invalid: @fastify/static@10.1.2 C:\\repo\\node_modules\\other'] }, lock)));
test('two allowed groups plus another problem still fail', () => assert.throws(() => validateTree({ problems: [wasm, emnapi, fastify, 'invalid: other@1.0.0 C:\\repo\\node_modules\\other'] }, lock)));
test('official Nest acceptance change invalidates the exception', () => assert.equal(isFastifyStaticCompatibilityException(fastify, { packages: { ...lock.packages, 'node_modules/@nestjs/platform-fastify': { ...lock.packages['node_modules/@nestjs/platform-fastify'], peerDependencies: { '@fastify/static': '^8.0.0 || ^9.0.0 || ^10.0.0' } } } }, tree), false));
