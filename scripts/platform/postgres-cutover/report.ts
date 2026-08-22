import { writeFileSync } from 'node:fs';
import { ConnectionIdentity, runId } from './config';

export type Finding = { status: 'PASS' | 'WARNING' | 'BLOCKER'; code: string };
export type CutoverReport = {
  schemaVersion: 1;
  runId: string;
  timestampUtc: string;
  toolVersion: string;
  source: ConnectionIdentity;
  target: ConnectionIdentity;
  findings: Finding[];
  decision: 'GO' | 'NO_GO';
  realCutoverApproved: false;
};

export function report(
  input: Omit<
    CutoverReport,
    'schemaVersion' | 'runId' | 'timestampUtc' | 'realCutoverApproved'
  >,
): CutoverReport {
  const findings = input.findings;
  return {
    ...input,
    schemaVersion: 1,
    runId: runId(),
    timestampUtc: new Date().toISOString(),
    realCutoverApproved: false,
    decision: findings.some((f) => f.status === 'BLOCKER')
      ? 'NO_GO'
      : input.decision,
  };
}

export function writeReport(path: string, value: CutoverReport) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}
