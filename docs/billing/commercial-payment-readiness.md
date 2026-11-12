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

As novas reservas registram uma cobrança pelo período da oferta: mensal,
trimestral ou semestral. Ouro custa R$ 100, R$ 200 ou R$ 400; Esmeralda custa
R$ 200, R$ 600 ou R$ 1.200, respectivamente. O checkout do NextStock usa esses
valores e frequências sem alterar os planos nem os links externos do Mercado
Pago. Reservas e checkouts antigos conservam as condições mensais registradas.
Para validar o fluxo integrado, abra o checkout a partir do NextStock e confira
o valor e a frequência antes de autorizar.

Cadastro por URL sem oferta promocional ou com promo=none limpa a oferta e
reserva antigas no navegador. O checkout normal não envia reserva órfã. A reserva
e o preço continuam sujeitos à validação no servidor, nunca ao preço do navegador.

Depois de implantar o PR e conferir os mapeamentos: conta nova sem promoção e
conta nova pela oferta selecionada, conferir identidade, trial, valor e recorrência
no checkout antes de autorizar; após o pagamento, conferir webhook e ativação da
assinatura correta. Não compartilhar credenciais ou dados de cartão nos logs.
