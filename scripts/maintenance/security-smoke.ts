async function main() {
  const baseUrl = String(process.env.SMOKE_BASE_URL || '').replace(/\/$/, '');
  if (!baseUrl) throw new Error('SMOKE_BASE_URL is required.');
  const url = new URL(baseUrl);
  const productionHost = process.env.PRODUCTION_APP_HOST?.toLowerCase();
  if (
    productionHost === url.hostname.toLowerCase() &&
    process.env.ALLOW_PRODUCTION_SMOKE !== 'true'
  ) {
    throw new Error('Production smoke requires ALLOW_PRODUCTION_SMOKE=true.');
  }
  const cookie = process.env.SMOKE_COOKIE;
  const branchId = process.env.SMOKE_BRANCH_ID;
  const checks = [
    { path: '/api/health', auth: false },
    { path: '/api/health/ready', auth: false },
    { path: '/api/auth/profile', auth: true },
    { path: '/api/system/context', auth: true },
    { path: '/api/products?pageSize=1', auth: true },
    { path: '/api/billing/subscription', auth: true },
  ];
  for (const check of checks) {
    if (check.auth && !cookie) continue;
    const response = await fetch(`${baseUrl}${check.path}`, {
      headers: {
        Accept: 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...(branchId ? { 'x-nextstock-branch-id': branchId } : {}),
      },
    });
    if (!response.ok) {
      throw new Error(
        `Smoke failed path=${check.path} status=${response.status}`,
      );
    }
    console.log(JSON.stringify({ path: check.path, status: response.status }));
  }
}

void main();
