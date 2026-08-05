import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { collectProblems, validateKnownSharpWasmArtifacts, validateTree } from './verify-dependency-tree.mjs';

const root = process.cwd();
const lockfile = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const installed = {
  'node_modules/@img/sharp-wasm32': readFile('node_modules/@img/sharp-wasm32/package.json', '@img/sharp-wasm32'),
  'node_modules/@emnapi/runtime': readFile('node_modules/@emnapi/runtime/package.json', '@emnapi/runtime'),
};
function readFile(file, name) { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return { name, version: lockfile.packages[`node_modules/${name}`].version }; } }

function tree({ wasm = true, runtime = true, staticInvalid = true, extra = false, reverse = false } = {}) {
  const problems = [];
  const dependencies = {
    sharp: { version: lockfile.packages['node_modules/sharp'].version, path: path.join(root, 'node_modules/sharp') },
    '@fastify/static': { name: '@fastify/static', version: '10.1.2', path: path.join(root, 'node_modules/@fastify/static'), invalid: staticInvalid },
  };
  if (wasm) dependencies['@img/sharp-wasm32'] = { name: '@img/sharp-wasm32', version: installed['node_modules/@img/sharp-wasm32'].version, path: path.join(root, 'node_modules/@img/sharp-wasm32'), extraneous: true };
  if (runtime) dependencies['@emnapi/runtime'] = { name: '@emnapi/runtime', version: installed['node_modules/@emnapi/runtime'].version, path: path.join(root, 'node_modules/@emnapi/runtime'), extraneous: true };
  if (extra) dependencies.other = { name: 'other', version: '1.0.0', path: path.join(root, 'node_modules/other'), extraneous: true };
  if (reverse) return { dependencies: { ...dependencies, '@emnapi/runtime': dependencies['@emnapi/runtime'], '@img/sharp-wasm32': dependencies['@img/sharp-wasm32'] } };
  return { dependencies, problems };
}

test('real lockfile-backed Sharp subtree passes', () => assert.equal(validateKnownSharpWasmArtifacts({ npmTree: tree(), lockfile, installedPackages: installed }).accepted, true));
test('absence of optional flag does not matter', () => { const lock = structuredClone(lockfile); delete lock.packages['node_modules/@img/sharp-wasm32'].optional; assert.equal(validateKnownSharpWasmArtifacts({ npmTree: tree(), lockfile: lock, installedPackages: installed }).accepted, true); });
test('root and node representations correlate into one problem with merged sources', () => { const result = collectProblems({ ...tree(), problems: ['extraneous: @emnapi/runtime@1.11.1', 'extraneous: @img/sharp-wasm32@0.35.2', 'invalid: @fastify/static@10.1.2'], error: { code: 'ELSPROBLEMS' } }); assert.equal(result.length, 3); assert.equal(result.rawCount, 6); assert.deepEqual([...result.find((p) => p.name === '@emnapi/runtime').sources].sort(), ['node.flags', 'root.problems']); assert.equal(result.find((p) => p.name === '@emnapi/runtime').path, 'node_modules/@emnapi/runtime'); assert.equal(validateKnownSharpWasmArtifacts({ npmTree: tree({ reverse: true }), lockfile, installedPackages: installed }).accepted, true); });
test('ELSPROBLEMS root summary is not a fourth problem', () => { const result = collectProblems({ ...tree(), error: { code: 'ELSPROBLEMS', summary: 'child problems' } }); assert.equal(result.some((p) => p.name === 'nest-test'), false); });
test('non-ELSPROBLEMS root error is rejected by validation', () => assert.throws(() => validateTree({ ...tree(), error: { code: 'EIO' } }, lockfile, installed)));
test('version different from lockfile fails', () => { const t = tree(); t.dependencies['@emnapi/runtime'].version = '99.0.0'; assert.equal(validateKnownSharpWasmArtifacts({ npmTree: t, lockfile, installedPackages: installed }).accepted, false); });
test('missing Sharp optional path fails', () => { const l = structuredClone(lockfile); for (const name of Object.keys(l.packages['node_modules/sharp'].optionalDependencies).filter((n) => n.includes('wasm'))) delete l.packages['node_modules/sharp'].optionalDependencies[name]; assert.equal(validateKnownSharpWasmArtifacts({ npmTree: tree(), lockfile: l, installedPackages: installed }).accepted, false); });
test('missing WASM edge fails', () => { const l = structuredClone(lockfile); for (const node of Object.values(l.packages)) if (node.dependencies?.['@img/sharp-wasm32']) delete node.dependencies['@img/sharp-wasm32']; assert.equal(validateKnownSharpWasmArtifacts({ npmTree: tree(), lockfile: l, installedPackages: installed }).accepted, false); });
test('path, name, resolved and integrity deviations fail', () => {
  const cases = [
    (t, l, p) => { t.dependencies['@img/sharp-wasm32'].path = path.join(root, 'node_modules/other'); },
    (t, l, p) => { p['node_modules/@img/sharp-wasm32'].name = '@img/sharp-wasm32-fake'; },
    (t, l, p) => { delete l.packages['node_modules/@img/sharp-wasm32'].resolved; },
    (t, l, p) => { delete l.packages['node_modules/@emnapi/runtime'].integrity; },
  ];
  for (const mutate of cases) { const t = tree(); const l = structuredClone(lockfile); const p = structuredClone(installed); mutate(t, l, p); assert.equal(validateKnownSharpWasmArtifacts({ npmTree: t, lockfile: l, installedPackages: p }).accepted, false); }
});
test('only one artifact, invalid, missing or peer-missing fails', () => { for (const t of [tree({ runtime: false }), tree({ wasm: false })]) assert.equal(validateKnownSharpWasmArtifacts({ npmTree: t, lockfile, installedPackages: installed }).accepted, false); assert.throws(() => validateTree({ ...tree(), problems: ['invalid: @emnapi/runtime'] }, lockfile, installed)); assert.throws(() => validateTree({ ...tree(), problems: ['missing: other'] }, lockfile, installed)); });
test('third extraneous and similar package fail', () => assert.throws(() => validateTree(tree({ extra: true }), lockfile, installed)));
test('Fastify exception remains exact and combined tree passes', () => { const result = validateTree(tree(), lockfile, installed); assert.equal(result.remaining.length, 0); });
test('Fastify changed or any unknown problem fails', () => { const t = tree(); t.dependencies['@fastify/static'].version = '9.0.0'; assert.throws(() => validateTree(t, lockfile, installed)); assert.throws(() => validateTree({ ...tree(), problems: ['invalid: other@1.0.0'] }, lockfile, installed)); });
test('no version allowlist exists in validator source', () => { const source = readFileSync('scripts/ci/verify-dependency-tree.mjs', 'utf8'); assert.doesNotMatch(source, /0\.35\.2|1\.11\.1|1\.11\.3/); });
