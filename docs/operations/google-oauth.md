# Configuração do login com Google

O NextStock já possui o fluxo OAuth 2.0 com Google usando `state`, PKCE, `nonce`,
sessão HttpOnly e vinculação segura da identidade ao perfil existente.

## Variáveis obrigatórias no ambiente de produção

Configure estas variáveis no serviço da API (por exemplo, Railway):

```text
GOOGLE_OAUTH_ENABLED=true
GOOGLE_OAUTH_CLIENT_ID=<ID do cliente OAuth>
GOOGLE_OAUTH_CLIENT_SECRET=<segredo do cliente OAuth>
GOOGLE_OAUTH_CALLBACK_URL=https://SEU_DOMINIO/api/auth/google/callback
LOCAL_AUTH_JWT_ACTIVE_KEY=<segredo com pelo menos 32 caracteres>
LOCAL_AUTH_JWT_KID=<identificador da chave>
```

O callback precisa ser exatamente igual ao cadastrado no Google Cloud. Não use
localhost em produção e nunca versionalize o segredo do cliente ou a chave JWT.

## Google Cloud Console

1. Crie ou selecione um projeto.
2. Configure a tela de consentimento OAuth.
3. Crie um cliente OAuth do tipo **Aplicativo da Web**.
4. Em **URIs de redirecionamento autorizados**, adicione:
   `https://SEU_DOMINIO/api/auth/google/callback`.
5. Copie o Client ID e o Client Secret para as variáveis do ambiente.
6. Faça um novo deploy da API.

## Comportamento do cadastro

O cadastro inicial continua usando e-mail, nome, empresa, tipo de sistema e senha,
porque esses dados criam o tenant, a filial Matriz e o período de teste. Depois do
cadastro, o primeiro login com o mesmo e-mail Google pode vincular a identidade
Google ao perfil elegível.

O login Google não cria automaticamente uma empresa sem esses dados e não permite
vincular uma conta a outro perfil por coincidência de e-mail.

## Diagnóstico

O endpoint `GET /api/auth/capabilities` informa se o Google está realmente pronto.
O backend valida as variáveis durante a inicialização. Se o OAuth estiver habilitado
com alguma variável obrigatória ausente, a API não inicia e o deploy deve ser
corrigido antes de liberar o recurso. A página também trata respostas HTTP de erro
no endpoint de capabilities como falha de verificação, sem informar que o recurso
foi desabilitado.
