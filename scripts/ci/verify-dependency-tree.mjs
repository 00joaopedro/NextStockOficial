import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import semver from 'semver';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TEMPORARY_FASTIFY_STATIC_SECURITY_COMPATIBILITY_EXCEPTION =
  'TEMPORARY_FASTIFY_STATIC_SECURITY_COMPATIBILITY_EXCEPTION';

function readLock() {
  return JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
}

function problemFor(problem, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^extraneous: ${escaped}@([^ ]+) (.+)$`).exec(problem);
  if (!match || !match[2].replaceAll('\\', '/').endsWith(`/node_modules/${name}`)) return null;
  return match;
}

export function isKnownSharpWasmOrphan(problems, lock, tree) {
  const wasmProblem = problems.map((p) => problemFor(p, '@img/sharp-wasm32')).find(Boolean);
  const runtimeProblem = problems.map((p) => problemFor(p, '@emnapi/runtime')).find(Boolean);
  if (!wasmProblem || !runtimeProblem) return false;

  const sharp = lock.packages?.['node_modules/sharp'];
  const wasm = lock.packages?.['node_modules/@img/sharp-wasm32'];
  const runtime = lock.packages?.['node_modules/@emnapi/runtime'];
  const sharpVersion = tree.dependencies?.sharp?.version;
  const wasmVersion = wasmProblem[1];
  const runtimeVersion = runtimeProblem[1];
  if (!sharp || !wasm || !runtime || !sharpVersion) return false;
  if (!sharp.resolved || !sharp.integrity || !wasm.resolved || !wasm.integrity || !runtime.resolved || !runtime.integrity) return false;
  if (sharp.optionalDependencies?.['@img/sharp-wasm32'] !== wasmVersion) return false;
  if (sharp.version !== sharpVersion || wasm.version !== wasmVersion || runtime.version !== runtimeVersion) return false;
  if (sharpVersion !== '0.35.2' || wasmVersion !== '0.35.2' || runtimeVersion !== '1.11.3') return false;
  if (sharp.optional !== undefined || wasm.optional !== true || runtime.optional !== true) return false;
  if (wasm.dependencies?.['@emnapi/runtime'] !== `^${runtimeVersion}`) return false;
  return true;
}

export function isFastifyStaticCompatibilityException(problem, lock, tree) {
  const match = /^invalid: @fastify\/static@([^ ]+) (.+)$/.exec(problem);
  if (!match) return false;
  if (!match[2].replaceAll('\\', '/').endsWith('/node_modules/@fastify/static')) return false;
  const staticPackage = lock.packages?.['node_modules/@fastify/static'];
  const platform = lock.packages?.['node_modules/@nestjs/platform-fastify'];
  const serveStatic = lock.packages?.['node_modules/@nestjs/serve-static'];
  if (!staticPackage || !platform || !serveStatic || !staticPackage.resolved || !staticPackage.integrity) return false;
  if (match[1] !== '10.1.2' || staticPackage.version !== '10.1.2' || tree.dependencies?.['@fastify/static']?.version !== '10.1.2') return false;
  if (platform.version !== '11.1.28' || serveStatic.version !== '5.0.5') return false;
  if (platform.peerDependencies?.['@fastify/static'] !== '^8.0.0 || ^9.0.0') return false;
  if (serveStatic.peerDependencies?.['@fastify/static'] !== '^8.0.4 || ^9.0.0') return false;
  return true;
}

export function validateTree(result, lock) {
  const problems = Array.isArray(result.problems) ? result.problems : [];
  const sharpProblems = problems.filter((p) => p.startsWith('extraneous: @img/sharp-wasm32@') || p.startsWith('extraneous: @emnapi/runtime@'));
  const fastifyProblems = problems.filter((p) => p.startsWith('invalid: @fastify/static@'));
  const sharpAllowed = sharpProblems.length === 2 && isKnownSharpWasmOrphan(sharpProblems, lock, result);
  const fastifyAllowed = fastifyProblems.length === 1 && isFastifyStaticCompatibilityException(fastifyProblems[0], lock, result);
  const tolerated = [];
  if (sharpAllowed) {
    tolerated.push(...sharpProblems);
    console.log('Known optional Sharp/WASM sub-tree tolerated: sharp -> @img/sharp-wasm32 -> @emnapi/runtime is optional and platform-unselected.');
  }
  if (fastifyAllowed) {
    tolerated.push(...fastifyProblems);
    console.log(`${TEMPORARY_FASTIFY_STATIC_SECURITY_COMPATIBILITY_EXCEPTION}: @fastify/static@10.1.2 is retained for security while Nest peer ranges remain ^8/^9; remove when Nest officially accepts 10.1.2+.`);
  }
  const remaining = problems.filter((problem) => !tolerated.includes(problem));
  if (remaining.length > 0) throw new Error(`Runtime dependency tree is invalid:\n${remaining.join('\n')}`);
  return { tolerated, remaining };
}

export function readNpmTree() {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ls', '--all', '--json', '--loglevel', 'silent'], { cwd: root, encoding: 'utf8' });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error(`npm ls did not return JSON (exit ${result.status})`);
  return JSON.parse(output.slice(start, end + 1));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) validateTree(readNpmTree(), readLock());
