import 'dotenv/config';
import { dumpPlan, restorePlan } from './plans';
import { connectionIdentity, loadConfig, sanitizeConnection } from './config';
import { report, writeReport } from './report';

function main() {
  const config = loadConfig();
  const command = process.argv[2] || 'preflight';
  const source = sanitizeConnection(config.sourceUrl); const target = sanitizeConnection(config.targetUrl);
  if (command === 'dump-plan') console.log(JSON.stringify({ command: dumpPlan(config, process.argv[3] || 'cutover.dump'), source }, null, 2));
  else if (command === 'restore-plan') console.log(JSON.stringify({ command: restorePlan(config, process.argv[3] || 'cutover.dump'), target }, null, 2));
  else if (command === 'preflight') {
    const value = report({ toolVersion: 'phase-4-offline', source, target, findings: [{ status: 'PASS', code: config.dryRun ? 'DRY_RUN' : 'EXPLICIT_EXECUTION_PLAN' }], decision: 'NO_GO' });
    if (config.reportPath) writeReport(config.reportPath, value);
    console.log(JSON.stringify(value));
  } else throw new Error('CUTOVER_COMMAND_INVALID');
}
try { main(); } catch (error) { console.error(error instanceof Error ? error.message : 'CUTOVER_FAILED'); process.exitCode = 1; }
