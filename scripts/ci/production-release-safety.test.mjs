import test from 'node:test';
import assert from 'node:assert/strict';
import { manualCiApproved, renderStatus, readiness } from './production-release-safety.mjs';

const sha = 'a'.repeat(40);
const repository = 'owner/repo';
const success = { head_sha: sha, head_branch: 'main', event: 'push', head_repository: { full_name: repository }, status: 'completed', conclusion: 'success', run_number: 4 };

test('manual release requires successful push CI for the exact revision and repository', () => {
  assert.equal(manualCiApproved({ workflow_runs: [success] }, sha, repository), true);
  for (const changed of [{ event: 'pull_request' }, { head_branch: 'dev' }, { head_sha: 'b'.repeat(40) }, { head_repository: { full_name: 'fork/repo' } }, { status: 'in_progress' }, { conclusion: 'failure' }]) {
    assert.equal(manualCiApproved({ workflow_runs: [{ ...success, ...changed }] }, sha, repository), false);
  }
  assert.equal(manualCiApproved({ workflow_runs: [success, { ...success, run_number: 5, conclusion: 'failure' }] }, sha, repository), false);
  assert.equal(manualCiApproved({}, sha, repository), false);
});

test('Render live deployment requires matching commit', () => {
  assert.equal(renderStatus({ status: 'live', commit: { id: sha } }, sha), 'live');
  assert.equal(renderStatus({ status: 'queued' }, sha), 'queued');
  assert.throws(() => renderStatus({ status: 'live' }, sha));
  assert.throws(() => renderStatus({ status: 'live', commit: { id: 'b'.repeat(40) } }, sha));
});

test('readiness rejects redirects, malformed URLs, and non-ready bodies', async () => {
  const response = (status, body) => async () => ({ status, json: async () => body });
  const url = 'https://service.example/api/health/ready';
  assert.equal(await readiness(url, response(200, { status: 'ready' })), true);
  assert.equal(await readiness(url, response(302, { status: 'ready' })), false);
  assert.equal(await readiness(url, response(200, { status: 'ok' })), false);
  assert.equal(await readiness('http://service.example/api/health/ready', response(200, { status: 'ready' })), false);
  assert.equal(await readiness('https://service.example/other', response(200, { status: 'ready' })), false);
});
