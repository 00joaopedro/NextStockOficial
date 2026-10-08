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

O botão valida o certificado armazenado e a configuração da filial. Com o provider `mock`, o resultado é explicitamente apenas local e não representa uma chamada à SEFAZ. Uma comunicação real depende de um provider fiscal real configurado.

Todas as operações de upload, validação, ativação, suspensão, remoção e teste são registradas na auditoria sem incluir senha, conteúdo do certificado ou caminho do Storage.
