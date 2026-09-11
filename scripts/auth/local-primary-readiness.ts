import { evaluateLocalPrimaryReadiness } from '../../src/auth/local-primary-readiness';

const report = evaluateLocalPrimaryReadiness();
console.log(JSON.stringify(report));
process.exitCode = report.status === 'READY' ? 0 : 1;
