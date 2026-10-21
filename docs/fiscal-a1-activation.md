# Configuração fiscal A1 por filial

O fluxo fiscal é controlado por um administrador e sempre fica limitado à filial selecionada.

## Estados

- `pendente`: sem certificado válido ou após falha de validação.
- `homologacao`: certificado válido, mas a filial ainda não está autorizada para produção.
- `ativo`: produção ativada após certificado, CNPJ, validade, provider real e confirmação do administrador.
- `suspenso`: ativação interrompida pelo administrador; o envio em produção é bloqueado.

Substituir o certificado retorna a filial para homologação. Remover o certificado retorna para pendente.

## Proteção do A1

O arquivo PKCS#12 e a senha são criptografados com AES-256-GCM antes do armazenamento. O Storage continua privado e o caminho, senha e conteúdo do certificado nunca são retornados ao navegador.

Configure no ambiente da aplicação:

- `CERT_ENCRYPTION_KEY`: chave base64 com exatamente 32 bytes.
- `CERT_ENCRYPTION_KEY_VERSION`: identificador versionado, por exemplo `v1`.
- `CERTIFICATE_MAX_SIZE_MB`: limite do upload, no máximo 20 MB.
- `SUPABASE_STORAGE_BUCKET_FISCAL_CERTIFICATES`: bucket privado dos certificados.

A rotação de chave deve ser planejada com migração controlada; não substitua a chave ativa sem recriptografar os certificados existentes.

## Teste de comunicação

O botão valida o certificado armazenado e a configuração da filial. Com o provider `mock`, o resultado é explicitamente apenas local e não representa uma chamada à SEFAZ. Para `sefaz`, `real` ou `sefaz-br`, a aplicação consulta o serviço de status configurado da SEFAZ usando o A1 da filial. Esta consulta não emite, numera, autoriza nem cancela documento fiscal.

O provider real precisa conter UF e endpoints HTTPS de autorização, status e cancelamento antes da ativação de produção. O resultado registrado contém somente código e mensagem de status; nunca certificado, senha, token ou URL com credenciais.

## Auditoria e limpeza resiliente

Upload, validação, ativação, suspensão e remoção gravam o evento de auditoria no outbox dentro da mesma transação da alteração fiscal. Assim, uma alteração crítica não é confirmada sem que o evento correspondente seja colocado para entrega.

Se o Storage não puder remover um A1 substituído, removido ou criado em um rollback, a aplicação cria uma tarefa persistida de limpeza. O worker tenta novamente com espera crescente, até oito tentativas. Configure, se necessário:

- `CERTIFICATE_CLEANUP_WORKER_ENABLED=false` para desabilitar o worker deliberadamente.
- `CERTIFICATE_CLEANUP_POLL_MS` para definir o intervalo de consulta; padrão de 30 segundos.
- `NEXTSTOCK_PROCESS_ROLE=api` para impedir que uma réplica somente de API execute tarefas em segundo plano.

O worker não registra o caminho do objeto nos logs. Falhas finais devem ser tratadas pelo time operacional por meio da tabela de tarefas de limpeza, sem copiar o certificado ou sua senha para tickets.

Todas as operações de upload, validação, ativação, suspensão, remoção e teste são registradas na auditoria sem incluir senha, conteúdo do certificado ou caminho do Storage.
