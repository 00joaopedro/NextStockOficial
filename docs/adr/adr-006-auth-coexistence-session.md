# ADR-006 — Sessão única durante coexistência de providers

Status: aceito para a Fase 5 offline.

O Supabase Auth permanece provider ativo padrão (`supabase_only`). O futuro SuperTokens será apenas provider de identidade/autenticação durante coexistência. Após autenticação, o backend emite a sessão local `nextstock_session`; não haverá cookie ou middleware de sessão SuperTokens nesta fase. Guards continuam confiando exclusivamente na sessão local e nas autorizações PostgreSQL.

Essa decisão evita duas autoridades de sessão, preserva rollback imediato para Supabase, não altera cookies/CSRF/CORS/CSP e mantém Storage independente. A migração completa de sessão exige uma fase futura, Core real, ensaio e aprovação humana.
