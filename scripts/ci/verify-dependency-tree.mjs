import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FASTIFY_EXCEPTION = 'TEMPORARY_FASTIFY_STATIC_SECURITY_COMPATIBILITY_EXCEPTION';

function readLockfile() { return JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8')); }

function parseProblem(raw, node = {}) {
  const text = String(raw);
  const typeMatch = /^(?:([^: ]+):\s*)?(.+?)(?:\s+(extraneous|invalid|missing|peer missing))?$/.exec(text);
  const type = node.extraneous ? 'extraneous' : node.invalid ? 'invalid' : node.missing ? 'missing' : node.peerMissing ? 'peerMissing' : node.error ? 'error' : typeMatch?.[1] || typeMatch?.[3] || 'error';
  const body = typeMatch?.[2] || text;
  const match = /(@[^@ ]+|[^@ ]+)@([^ ]+)/.exec(body);
  return { type, name: node.name || match?.[1], version: node.version || match?.[2], path: node.path, raw: text };
}

export function collectProblems(npmTree) {
  const collected = [];
  const add = (problem) => {
    const key = JSON.stringify([problem.type, problem.name, problem.version, problem.path]);
    if (!collected.some((item) => JSON.stringify([item.type, item.name, item.version, item.path]) === key)) collected.push(problem);
  };
  for (const raw of npmTree.problems || []) add(parseProblem(raw));
  const visit = (node, fallbackName, fallbackPath) => {
    if (!node || typeof node !== 'object') return;
    const current = { ...node, name: node.name || fallbackName, path: node.path || fallbackPath };
    for (const type of ['extraneous', 'invalid', 'missing', 'peerMissing', 'error']) if (current[type]) add(parseProblem(`${type}: ${current.name || ''}@${current.version || ''}`, current));
    for (const raw of current.problems || []) add(parseProblem(raw, current));
    for (const [name, child] of Object.entries(current.dependencies || {})) visit(child, name, child.path || path.join(current.path || root, 'node_modules', ...name.split('/')));
  };
  visit(npmTree, npmTree.name, npmTree.path || root);
  for (const problem of collected) if (!problem.path && problem.name) {
    const found = collected.find((candidate) => candidate.name === problem.name && candidate.version === problem.version && candidate.path);
    if (found) problem.path = found.path;
  }
  return collected;
}

function exactPath(problem, relative) {
  return problem.path && path.relative(root, problem.path).replaceAll('\\', '/') === relative;
}

function sharpOptionalReachesWasm(lockfile) {
  const sharp = lockfile.packages?.['node_modules/sharp'];
  if (!sharp?.optionalDependencies) return false;
  const visit = (name, optionalEdge, seen = new Set()) => {
    if (!optionalEdge || seen.has(name)) return false;
    if (name === '@img/sharp-wasm32') return true;
    seen.add(name);
    const node = lockfile.packages?.[`node_modules/${name}`];
    if (!node) return false;
    return Object.keys({ ...node.dependencies, ...node.optionalDependencies }).some((child) => visit(child, true, seen));
  };
  return Object.keys(sharp.optionalDependencies).some((name) => visit(name, true));
}

export function validateKnownSharpWasmArtifacts({ npmTree, lockfile, installedPackages }) {
  const problems = collectProblems(npmTree);
  const wasmProblems = problems.filter((p) => p.name === '@img/sharp-wasm32' && exactPath(p, 'node_modules/@img/sharp-wasm32'));
  const runtimeProblems = problems.filter((p) => p.name === '@emnapi/runtime' && exactPath(p, 'node_modules/@emnapi/runtime'));
  if (wasmProblems.length !== 1 || runtimeProblems.length !== 1 || wasmProblems[0].type !== 'extraneous' || runtimeProblems[0].type !== 'extraneous') return { accepted: false, problems };

  const sharp = lockfile.packages?.['node_modules/sharp'];
  const wasm = lockfile.packages?.['node_modules/@img/sharp-wasm32'];
  const runtime = lockfile.packages?.['node_modules/@emnapi/runtime'];
  const installedWasm = installedPackages['node_modules/@img/sharp-wasm32'];
  const installedRuntime = installedPackages['node_modules/@emnapi/runtime'];
  if (!sharp || !wasm || !runtime || !installedWasm || !installedRuntime) return { accepted: false, problems };
  if (!sharpOptionalReachesWasm(lockfile) || !wasm.dependencies?.['@emnapi/runtime']) return { accepted: false, problems };
  if (!wasm.resolved || !wasm.integrity || !runtime.resolved || !runtime.integrity) return { accepted: false, problems };
  if (installedWasm.name !== '@img/sharp-wasm32' || installedRuntime.name !== '@emnapi/runtime') return { accepted: false, problems };
  if (installedWasm.version !== wasm.version || installedRuntime.version !== runtime.version) return { accepted: false, problems };
  if (wasmProblems[0].version !== wasm.version || runtimeProblems[0].version !== runtime.version) return { accepted: false, problems };
  return { accepted: true, problems: [...wasmProblems, ...runtimeProblems], versions: { wasm: wasm.version, runtime: runtime.version } };
}

export function isFastifyStaticCompatibilityException(problem, lockfile, npmTree) {
  if (problem.type !== 'invalid' || problem.name !== '@fastify/static' || !exactPath(problem, 'node_modules/@fastify/static')) return false;
  const staticPackage = lockfile.packages?.['node_modules/@fastify/static'];
  const platform = lockfile.packages?.['node_modules/@nestjs/platform-fastify'];
  const serveStatic = lockfile.packages?.['node_modules/@nestjs/serve-static'];
  return Boolean(staticPackage?.resolved && staticPackage?.integrity && staticPackage.version === '10.1.2' && problem.version === '10.1.2' && platform?.version === '11.1.28' && serveStatic?.version === '5.0.5' && platform.peerDependencies?.['@fastify/static'] === '^8.0.0 || ^9.0.0' && serveStatic.peerDependencies?.['@fastify/static'] === '^8.0.4 || ^9.0.0' && npmTree.dependencies?.['@fastify/static']?.version === '10.1.2');
}

export function validateTree(npmTree, lockfile, installedPackages) {
  const problems = collectProblems(npmTree);
  const sharp = validateKnownSharpWasmArtifacts({ npmTree, lockfile, installedPackages });
  const tolerated = [];
  if (sharp.accepted) { tolerated.push(...sharp.problems); console.log(`KNOWN_OPTIONAL_SHARP_WASM_ARTIFACTS:\n@img/sharp-wasm32@${sharp.versions.wasm} and @emnapi/runtime@${sharp.versions.runtime}\nare lockfile-verified optional artifacts of sharp.`); }
  const fastify = problems.filter((p) => isFastifyStaticCompatibilityException(p, lockfile, npmTree));
  if (fastify.length === 1) { tolerated.push(fastify[0]); console.log(`${FASTIFY_EXCEPTION}:\n@fastify/static@10.1.2 retained for security while Nest peer ranges remain ^8/^9.`); }
  const remaining = problems.filter((problem) => !tolerated.some((allowed) => allowed.type === problem.type && allowed.name === problem.name && allowed.version === problem.version && allowed.path === problem.path));
  if (remaining.length) throw new Error(`Runtime dependency tree is invalid:\n${remaining.map((p) => p.raw).join('\n')}`);
  console.log(`Runtime dependency tree accepted with ${tolerated.length ? '2 narrowly verified compatibility exceptions' : 'no compatibility exceptions'}.`);
  return { tolerated, remaining };
}

function installedPackages() {
  const read = (name) => JSON.parse(readFileSync(path.join(root, name, 'package.json'), 'utf8'));
  return { 'node_modules/@img/sharp-wasm32': read('node_modules/@img/sharp-wasm32'), 'node_modules/@emnapi/runtime': read('node_modules/@emnapi/runtime') };
}

export function readNpmTree() {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ls', '--all', '--json', '--loglevel', 'silent'], { cwd: root, encoding: 'utf8' });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const start = output.indexOf('{'); const end = output.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error(`npm ls did not return JSON (exit ${result.status})`);
  return JSON.parse(output.slice(start, end + 1));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) validateTree(readNpmTree(), readLockfile(), installedPackages());
