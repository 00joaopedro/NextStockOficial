# Preparação de checkout comercial

Não executar o seed geral para reparar um alerta de checkout: ele altera preços e
outros dados do catálogo. A ferramenta abaixo só inspeciona, por padrão:

```
node scripts/billing/prepare-commercial-checkout.js
```

No serviço com acesso ao banco correto, usar `--apply` somente após conferir o
alvo. Cria somente mapeamentos ausentes para planos já existentes e ativos, sem
alterar preços, assinaturas, IDs externos ou links existentes. Recusa planos ou
mapeamentos desabilitados; esses casos exigem revisão. Não cria checkout ou cobrança.
A aplicação usa transação; uma falha reverte as criações dessa tentativa.

```
node scripts/billing/prepare-commercial-checkout.js --apply
```

BILLING_MODE e MERCADO_PAGO_MODE devem concordar. A ferramenta verifica o mesmo
provedor e modo do checkout. Executar a inspeção em Railway e Render se conectarem
a bancos diferentes; compartilhar banco não implica compartilhar configuração.

O checkout informa start_date quando ainda existe trial válido na assinatura;
não reinicia o trial. O teste técnico production-test-r1 continua sem adiamento.
O término promocional conta a partir desse início. Aprovação, valor, data e webhook
precisam ser conferidos no Mercado Pago no teste real; CI não prova entrega externa.

Ouro 3m e 6m: novos checkouts usam R$ 66,66 mensais, com totais de R$ 199,98
e R$ 399,96. O catálogo e a landing anunciam os mesmos valores. Assinaturas e
checkouts já criados não são reajustados automaticamente; suas condições devem
ser verificadas separadamente. Links fixos externos não são atualizados por este
PR e não devem substituir o checkout rastreável do NextStock.

Cadastro por URL sem oferta promocional ou com promo=none limpa a oferta e
reserva antigas no navegador. O checkout normal não envia reserva órfã. A reserva
e o preço continuam sujeitos à validação no servidor, nunca ao preço do navegador.

Depois de implantar o PR e conferir os mapeamentos: conta nova sem promoção e
conta nova pela oferta selecionada, conferir identidade, trial, valor e recorrência
no checkout antes de autorizar; após o pagamento, conferir webhook e ativação da
assinatura correta. Não compartilhar credenciais ou dados de cartão nos logs.
