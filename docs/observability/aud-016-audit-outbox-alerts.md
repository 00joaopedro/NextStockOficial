# AUD-016 — Audit Outbox operational alerts

The Audit Outbox worker emits structured `audit_outbox_metrics` log events
with pending, processing, retryable, final-failure, backlog and oldest-event
lag values. It emits rate-limited `audit_outbox_alert` events when final
failures exist, backlog reaches its threshold, or lag exceeds its SLA.

Alerting is local and log-based; no external alerting service is required.
`AUDIT_OUTBOX_ALERT_COOLDOWN_SECONDS` limits repeated alerts per alert type.
Metrics remain emitted when alerting is disabled with
`AUDIT_OUTBOX_ALERTING_ENABLED=false`.

The worker stops claiming new rows during application shutdown and waits for
active deliveries up to `AUDIT_OUTBOX_SHUTDOWN_TIMEOUT_MS`. Unfinished leases
remain durable in PostgreSQL and are reclaimed by a worker after expiry.
