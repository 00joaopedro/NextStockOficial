import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import semver from 'semver';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readLock() {
  return JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
}

export function isKnownOptionalSharpOrphan(problem, lock) {
  const match = /^extraneous: @emnapi\/runtime@([^ ]+) (.+[\\/]node_modules[\\/]@emnapi[\\/]runtime)$/.exec(problem);
  if (!match) return false;

  const runtime = lock.packages?.['node_modules/@emnapi/runtime'];
  const wasm = lock.packages?.['node_modules/@img/sharp-wasm32'];
  if (!runtime || !wasm) return false;
  if (runtime.optional !== true || wasm.optional !== true) return false;
  const range = wasm.dependencies?.['@emnapi/runtime'];
  if (!range || !semver.satisfies(runtime.version, range) || !semver.satisfies(match[1], range)) return false;
  return true;
}

export function validateTree(result, lock) {
  const problems = Array.isArray(result.problems) ? result.problems : [];
  const tolerated = problems.filter((problem) => isKnownOptionalSharpOrphan(problem, lock));
  const remaining = problems.filter((problem) => !isKnownOptionalSharpOrphan(problem, lock));

  if (tolerated.length > 0) {
    console.log('Known optional Sharp/WASM orphan tolerated: @emnapi/runtime is optional and its @img/sharp-wasm32 parent is not selected for this platform.');
  }
  if (remaining.length > 0) {
    throw new Error(`Runtime dependency tree is invalid:\n${remaining.join('\n')}`);
  }
  return { tolerated, remaining };
}

export function readNpmTree() {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ls', '--all', '--json', '--loglevel', 'silent'], {
    cwd: root,
    encoding: 'utf8',
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error(`npm ls did not return JSON (exit ${result.status})`);
  return JSON.parse(output.slice(start, end + 1));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  validateTree(readNpmTree(), readLock());
}
