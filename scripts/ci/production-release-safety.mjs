import { pathToFileURL } from 'node:url';

export function manualCiApproved(payload, sha, repository) {
  if (!Array.isArray(payload?.workflow_runs) || !/^[a-f0-9]{40}$/.test(sha)) return false;
  const runs = payload.workflow_runs.filter((run) =>
    run.head_sha === sha && run.head_branch === 'main' && run.event === 'push' &&
    run.head_repository?.full_name === repository,
  );
  if (!runs.length) return false;
  runs.sort((a, b) => Number(b.run_number) - Number(a.run_number));
  return runs[0].status === 'completed' && runs[0].conclusion === 'success';
}

export async function verifyManualCi({ token, sha, repository }, request = fetch) {
  if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repository || '') || !/^[a-f0-9]{40}$/.test(sha || '')) {
    throw new Error('CI lookup configuration missing.');
  }
  const url = `https://api.github.com/repos/${repository}/actions/workflows/ci.yml/runs?branch=main&event=push&head_sha=${sha}&per_page=100`;
  const response = await request(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok || !manualCiApproved(await response.json(), sha, repository)) {
    throw new Error('No successful trusted main CI for this revision.');
  }
}

export function renderStatus(payload, sha) {
  if (!/^[a-f0-9]{40}$/.test(sha) || typeof payload?.status !== 'string') {
    throw new Error('Invalid Render deployment status.');
  }
  const commit = payload.commit?.id || payload.commitId;
  if ((commit && commit !== sha) || (payload.status === 'live' && commit !== sha)) {
    throw new Error('Render revision missing or different from approved revision.');
  }
  return payload.status;
}

export async function readiness(url, request = fetch) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
      parsed.pathname !== '/api/health/ready' || parsed.search || parsed.hash) return false;
  const response = await request(parsed, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
  if (response.status !== 200) return false;
  const body = await response.json();
  return body?.status === 'ready';
}

async function main() {
  const command = process.argv[2];
  if (command === 'check-ci') {
    const { GH_TOKEN: token, RELEASE_SHA: sha, RELEASE_REPOSITORY: repository } = process.env;
    await verifyManualCi({ token, sha, repository });
    console.log('Manual release CI verified.');
  } else if (command === 'render-status') {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    console.log(renderStatus(JSON.parse(input), process.env.REVISION));
  } else if (command === 'ready') {
    if (!(await readiness(process.env.DEPLOY_HEALTHCHECK_URL))) process.exitCode = 1;
  } else {
    throw new Error('Unknown release safety command.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Release safety check failed.'); process.exitCode = 1; });
}
