# Pagamentos operacionais por tenant — fase 1

## Levantamento do repositório

O schema existente já separava `Tenant`, `Branch`, `UserProfile`/`TenantMember`, `Order`/`OrderItem`, `Sale`/`SalePayment`, `PaymentMachine`, `SecurityAuditEvent`, eventos de billing e a idempotência do storefront. `PaymentMachine` era um cadastro de equipamento do PDV com taxa, enquanto `billing/` tinha uma abstração de gateway Mercado Pago exclusivamente para cobrar a assinatura do NextStock. Nenhuma das duas deve representar a autorização financeira do lojista.

No backend, a autenticação usa JWT e guards de papel; `TenantContextService` revalida membership, filial, tipo e modo; `PreviewMutationGuard` bloqueia mutações; pedidos, vendas/caixa e storefront já validam tenant/filial e preços no servidor. Billing já possui webhook e reconciliação autoritativa, mas com credencial da plataforma. Não há WebSocket no fluxo de pagamentos atual. `CertificateCryptoService` forneceu o padrão local para AES-GCM e `AuditService` sanitiza auditoria.

No frontend, `perfil.html` já concentrava perfil, assinatura e o cadastro legado de maquininhas; `caixa.html`/`caixa.js`, `pedido.html`/`pedido.js`, sidebar e session-state mantêm filial e preview. A nova configuração foi adicionada ao perfil sem enviar segredos de volta ao navegador.

## Arquitetura

O módulo `payments` é o domínio operacional e não importa `billing`. O registry seleciona adaptadores por `PaymentProviderCode`; as portas segregadas cobrem OAuth, PIX, terminal e webhook. Assim pedidos e caixa dependem do serviço/portas e não de condicionais do Mercado Pago.

- `PaymentTerminal`: dispositivo da filial, opcionalmente ligado a uma conexão. O serial recebido é imediatamente mascarado.
- `PaymentConnection`: autorização tenant-wide; o access token é validado antes da gravação e cifrado com AES-256-GCM/AAD (`tenantId`, `connectionId`, versão e versão da chave).
- `PaymentRoutingPreference`: chave única `tenant + método + contexto`, evitando dois defaults.
- `PaymentTransaction`: tentativa imutavelmente identificada por idempotência tenant-wide e vinculada a pedido/venda.
- `PaymentWebhookEvent`: deduplicação, hash e payload minimizado; o evento só dispara uma consulta autenticada ao provedor, que é a fonte da transição de status.

## Configuração segura

Variáveis do módulo (somente backend/Railway):

- `PAYMENT_CREDENTIALS_ENCRYPTION_KEY`: 32 bytes em base64, diferente das demais chaves.
- `PAYMENT_CREDENTIALS_KEY_VERSION`: identificador da versão ativa.
- `MERCADO_PAGO_APP_WEBHOOK_SECRET`: secret da aplicação Mercado Pago usado para validar `x-signature`.
- Para OAuth futuro já suportado pelo adapter: `MERCADO_PAGO_CLIENT_ID`, `MERCADO_PAGO_CLIENT_SECRET` e `MERCADO_PAGO_OAUTH_REDIRECT_URI`.

Cadastre o webhook em `POST /api/payments/webhooks/mercado-pago`. Não registre tokens, payloads completos ou dados de cartão. Rotação exige recifrar as conexões em job controlado antes de trocar a versão ativa. A migration deve ser aplicada separadamente com `npm run railway:migrate`; nunca via boot ou `db push`.

## Fluxo Mercado Pago

Na fase 1 o administrador informa um access token da própria conta, que é transmitido por HTTPS, validado em `/users/me`, cifrado e nunca retornado. A UI permite cadastrar terminais e definir rotas para PIX, cartão online, Point e boleto. `POST /api/payments/pix` exige pedido da filial, valor exatamente igual ao total servidor-side, rota ativa e idempotency key; o QR retornado é metadado não sensível da transação. Eventos assinados são deduplicados e o status é novamente consultado no Mercado Pago.
