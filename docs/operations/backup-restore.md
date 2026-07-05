# Backup e restore

## Politica recomendada

- habilitar backup/PITR do Supabase conforme o plano;
- dump logico diario, criptografado e armazenado fora do projeto;
- retencao inicial: 7 diarios, 4 semanais e 6 mensais;
- backup adicional antes de migration grande/destrutiva;
- inventario e copia incremental dos buckets;
- checksum, data, environment, migration version e contagens no manifesto;
- nunca versionar dumps, manifests com secrets ou certificados.

## Restore em staging

1. Confirmar que o destino e staging vazio e separado.
2. Validar checksum e descriptografar em area temporaria protegida.
3. Restaurar banco e storage com credenciais de curta duracao.
4. Rodar `prisma migrate status`, constraints, RLS/policies e contagens.
5. Executar smoke multi-tenant, billing, fiscal e downloads privados.
6. Registrar RPO/RTO observados e destruir os dados restaurados ao concluir.

Use `BACKUP_FILE` e `BACKUP_SHA256` com `npm run backup:verify` para validar
tamanho e checksum antes do restore. O script nao abre conexao nem contem
credenciais.

RPO sugerido: banco 1 hora (PITR) e storage 24 horas. RTO inicial: API 4
horas, recuperacao completa/fiscal 8 horas. O teste de restore deve ocorrer ao
menos trimestralmente e depois de mudancas relevantes no processo.

Inclua `user_sessions` e `stored_files` na validacao de restore. Depois do
restore, confirme que sessoes revogadas continuam revogadas e reconcilie o
inventario `stored_files` com os buckets antes de liberar downloads.
