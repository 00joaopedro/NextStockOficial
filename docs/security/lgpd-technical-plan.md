# Plano tecnico LGPD

`PrivacyService` prepara manifesto de exportacao estritamente por `tenantId`,
sem secrets, certificado, conteudo de arquivo ou signed URL. Nao ha endpoint
publico nesta fase.

A anonimizacao permanece dry-run: perfis podem ter nome/email substituidos
quando juridicamente permitido, enquanto vendas, billing, fiscal e auditoria
preservam o minimo obrigatorio sem quebrar FKs. Toda execucao futura deve exigir
aprovacao, auditoria, tenant scoping e teste em staging.

Relatorios:

- `npm run privacy:report-pii` retorna apenas contagens;
- `npm run privacy:report-retention` retorna candidatos, sem apagar;
- nenhum script contem credenciais ou aceita producao implicitamente.

Certificados A1 ficam fora de exportacoes comuns. Rotacao de chave deve manter
versoes necessarias para descriptografar dados existentes; revogacao e descarte
devem seguir runbook fiscal.
