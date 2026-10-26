# Blueprint da Render

O arquivo `render.yaml` versiona a configuração do serviço de contingência
`NextStockOficial` na Render. Ele não contém valores de segredos.

## Build e migrations

O Build Command da Render só instala dependências e compila a aplicação:

```text
npm ci --include=dev && npm run build
```

Ele não executa migrations. Não adicione `prisma migrate deploy` ao Build
Command nem ao Start Command da Render.

As migrations de produção são uma etapa controlada e separada no provedor
principal, executada somente pelo wrapper protegido:

```text
npm run railway:migrate
```

Antes de uma sincronização manual do Blueprint que acompanhe uma mudança de
schema, confirme que a migration foi aplicada e que a aplicação em produção
está saudável.

## Variáveis

Os valores continuam configurados no painel da Render. As entradas
`sync: false` no Blueprint preservam os valores já existentes e impedem que
segredos sejam versionados no repositório.

## Sincronização no plano Free

Como o Auto Sync não está disponível, uma mudança futura em `render.yaml`
exige revisão e acionamento manual do sync no painel da Render. Na prévia,
confirme que a Render atualizará o serviço existente `NextStockOficial`;
se ela indicar criação de outro serviço, cancele a operação.
