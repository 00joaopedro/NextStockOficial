# Dashboard cache coherence (RC-014)

The repository has no configured Redis, shared cache, or reliable runtime
pub/sub. Runtime PostgreSQL uses the Supabase transaction pooler, so it is not a
suitable persistent `LISTEN/NOTIFY` connection. RC-014 therefore selects option
C: production and staging default to authoritative reads with only process-local
singleflight. A local materialized cache is available for development/test, or
when an operator explicitly declares a single-replica topology.

`DASHBOARD_CACHE_MODE` accepts `auto`, `local`, or `disabled`. Even `local` is
forced off in deployed environments unless `DASHBOARD_CACHE_SINGLE_REPLICA=true`.
The safe default is false. The explicit staleness SLA and TTL default to 5000 ms,
are limited to 100–30000 ms, and TTL may not exceed the SLA. In multi-replica
production the effective consistency SLA is the next authoritative read after
commit because no materialized value survives a request.

Keys use format version `v2` and canonical JSON. They include tenant, branch
(with an explicit all-branches value), user/role, system type, dashboard type,
timezone, period, and filters. Object keys are sorted. Do not put secrets in
filters.

Generation fencing prevents a factory that started before invalidation from
repopulating the cache. Singleflight is scoped to key plus generation; rejected
factories are removed. Mutation invalidation runs from the response-success path
after service transactions have committed. Its failure is non-fatal because
deployed multi-replica mode uses authoritative reads and local mode retains the
bounded TTL fallback.

Local storage is capped by `DASHBOARD_CACHE_MAX_ENTRIES` with deterministic
oldest-entry eviction and lazy expiry. Shutdown clears values, generations, and
in-flight references. Enabling single-replica local cache improves repeat-read
latency but requires the operator to keep the topology at exactly one replica.
