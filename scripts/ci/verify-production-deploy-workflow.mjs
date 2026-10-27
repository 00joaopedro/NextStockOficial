import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/deploy-production.yml', 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const renderBlueprint = readFileSync('render.yaml', 'utf8');

const requiredWorkflowFragments = [
  'workflow_run:',
  'workflows: ["CI security"]',
  'branches: [main]',
  'workflow_dispatch:',
  'github.event.workflow_run.conclusion == \'success\'',
  'github.event.workflow_run.head_sha',
  'group: production-release',
  'cancel-in-progress: false',
  'npm run production:migrate',
  'RAILWAY_HEALTHCHECK_URL',
  'RENDER_HEALTHCHECK_URL',
  'commitId',
  'actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683',
  'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
];
for (const fragment of requiredWorkflowFragments) {
  if (!workflow.includes(fragment)) {
    throw new Error(`Production workflow is missing required fragment: ${fragment}`);
  }
}
if (/uses:\s+[^\s@]+@(?![0-9a-f]{40}\b)/.test(workflow)) {
  throw new Error('All GitHub Actions in deploy-production.yml must be pinned to full SHAs');
}
if (packageJson.scripts['railway:migrate'] !== 'npm run production:migrate') {
  throw new Error('railway:migrate must remain a compatibility alias');
}
if (!/^\s*autoDeployTrigger:\s*off\s*$/m.test(renderBlueprint)) {
  throw new Error('Render auto deploy must be disabled in the Blueprint');
}
console.log('Production deployment workflow contract verified');
