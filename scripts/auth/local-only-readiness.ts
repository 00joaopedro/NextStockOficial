import { evaluateLocalOnlyReadiness } from '../../src/auth/local-only-readiness';

const report = evaluateLocalOnlyReadiness();
console.log(JSON.stringify(report));
process.exitCode = report.status === 'READY' ? 0 : 1;
