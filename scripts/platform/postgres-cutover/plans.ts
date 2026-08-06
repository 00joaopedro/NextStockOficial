import { CutoverConfig, connectionIdentity } from './config';

export function dumpPlan(config: CutoverConfig, file: string): string[] {
  const source = connectionIdentity(config.sourceUrl);
  return ['pg_dump', '--format=custom', '--no-owner', '--no-acl', '--file', file, `${source.host}:${source.port}/${source.database}`];
}

export function restorePlan(config: CutoverConfig, file: string): string[] {
  const target = connectionIdentity(config.targetUrl);
  return ['pg_restore', '--no-owner', '--no-acl', '--exit-on-error', '--dbname', `${target.host}:${target.port}/${target.database}`, file];
}

export const drainQueries = [
  "SELECT 'audit_outbox_events' AS relation, COUNT(*) FILTER (WHERE status = 'PROCESSING') AS active, COUNT(*) FILTER (WHERE status <> 'DELIVERED') AS backlog FROM audit_outbox_events",
  "SELECT 'gateway_webhook_events' AS relation, COUNT(*) FILTER (WHERE processing_status = 'PROCESSING') AS active, COUNT(*) AS backlog FROM gateway_webhook_events",
];
