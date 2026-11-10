# Vagas promocionais reservadas

A oferta é vinculada à empresa quando a reserva é gravada. Ela ocupa uma vaga até a conversão, inclusive após o fim da campanha ou do trial. O trial e a autorização de uso continuam seguindo as regras de assinatura. Um cadastro que não chegou a reservar uma vaga continua sem garantia de oferta.

O perfil recupera a oferta do servidor. Pode abrir um checkout novo quando não houver checkout associado, ou retomar o checkout aberto vinculado à própria empresa. Se o checkout vinculado não puder ser retomado, confirme o estado com a conciliação antes de qualquer nova tentativa. Não recrie a cobrança ou libere a vaga para tratar um estado desconhecido.

Aplique a migration `20261110180000_promotion_reservation_without_expiry` na etapa controlada de migrations **antes** de publicar o backend. Atualize todas as réplicas e serviços que compartilham o banco na mesma janela: versões antigas ainda aplicam a regra de expiração. Registros `RESERVED` com data antiga passam a ser preservados. Registros já `EXPIRED` ou `RELEASED` não são reativados automaticamente.

Em homologação, reserve uma oferta, confirme a visualização em outra sessão, encerre a campanha, encerre o trial e confira que o checkout mantém a oferta. Após confirmação do gateway, valide uma única conversão e a ativação da assinatura. Sem pagamento confirmado, o checkout aberto não equivale a conversão.
