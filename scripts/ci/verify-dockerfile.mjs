import { readFileSync } from 'node:fs';

const dockerfile = readFileSync('Dockerfile', 'utf8');
const npmCi = dockerfile.indexOf('RUN npm ci');
const buildCopy = dockerfile.indexOf('FROM node:22-bookworm-slim AS build');
const buildEnd = dockerfile.indexOf('FROM node:22-bookworm-slim AS runtime');
if (buildCopy < 0 || buildEnd < 0 || npmCi < buildCopy || npmCi > buildEnd) {
  throw new Error('Dockerfile must run npm ci in the build stage');
}
for (const required of [
  'COPY package.json package-lock.json .npmrc ./',
  'COPY prisma ./prisma',
  'COPY prisma.config.ts ./',
  'COPY scripts/lib ./scripts/lib',
]) {
  const position = dockerfile.indexOf(required);
  if (position < buildCopy || position > npmCi) {
    throw new Error(`${required} must precede npm ci`);
  }
}
if ((dockerfile.match(/apt-get install[^\n]*openssl/g) || []).length < 2) {
  throw new Error('OpenSSL must be installed in build and runtime stages');
}
if (/npm ci[^\n]*--force|npm install(?:\s|$)/.test(dockerfile)) {
  throw new Error('Dockerfile uses a forbidden npm installation mode');
}
if (!dockerfile.includes('node scripts/ci/verify-dependency-tree.mjs')) {
  throw new Error('DEP-016 verifier must run in the Docker build');
}
console.log('Dockerfile packaging order verified');
